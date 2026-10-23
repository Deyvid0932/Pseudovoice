import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:
    httpx = None

from .config import settings

logger = logging.getLogger("pseudovoice.resilient_queue")

class ResilientMessageQueue:
    """
    Cola asíncrona desacoplada con reintentos exponenciales y almacenamiento de contingencia (spool).
    Garantiza que la persistencia en Spring Boot no frene el WebSocket de voz
    y que ninguna telemetría ni mensaje se pierda ante caídas transitorias.
    """

    def __init__(self):
        self._queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._is_running: bool = False
        self._spool_dir = settings.SPOOL_DIR
        self._spool_file = self._spool_dir / "failed_messages.jsonl"
        self._spool_dir.mkdir(parents=True, exist_ok=True)

    async def enqueue(
        self,
        conversation_id: int,
        role: str,
        content: str,
        tts_latency_ms: Optional[int] = None,
        generated_audio_path: Optional[str] = None,
    ) -> None:
        """Encola de forma no bloqueante un mensaje para ser persistido."""
        payload = {
            "conversationId": conversation_id,
            "role": role,
            "content": content,
            "generatedAudioPath": generated_audio_path,
            "ttsLatencyMs": tts_latency_ms,
        }
        await self._queue.put(payload)
        logger.debug("Mensaje encolado en ResilientMessageQueue (tamaño: %d).", self._queue.qsize())

    async def enqueue_turn(
        self,
        conversation_id: int,
        turn_id: str,
        transcript: str,
        response: str,
        route: str,
        metrics: Dict[str, float],
        generated_audio_path: Optional[str] = None,
        transcription_metadata: Optional[dict] = None,
    ) -> None:
        """Encola el turno terminado como una unidad recuperable e idempotente."""
        common = {"conversationId": conversation_id, "turnId": turn_id}
        user = {**common, "role": "user", "content": transcript, "transcriptionMetadata": transcription_metadata}
        assistant = {
            **common,
            "role": "assistant",
            "content": response,
            "route": route,
            "sttLatencyMs": metrics["stt_latency_ms"],
            "decisionLatencyMs": metrics["decision_latency_ms"],
            "llmLatencyMs": metrics["llm_latency_ms"],
            "ttsLatencyMs": round(metrics["tts_latency_ms"]),
            "totalTurnLatencyMs": metrics["total_turn_latency_ms"],
            "generatedAudioPath": generated_audio_path,
        }
        await self._queue.put({"messages": [user, assistant]})

    async def start_worker(self) -> None:
        """Bucle de consumo asíncrono continuo con reintentos y backoff exponencial."""
        self._is_running = True
        logger.info("Worker de ResilientMessageQueue iniciado.")

        # Reintentar enviar mensajes encolados en spool previo si existen
        await self._flush_spool_if_possible()
        loop = asyncio.get_running_loop()
        next_spool_retry = loop.time() + 30

        while self._is_running:
            try:
                # Esperar siguiente mensaje con timeout para permitir chequeos limpios
                try:
                    payload = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if loop.time() >= next_spool_retry:
                        await self._flush_spool_if_possible()
                        next_spool_retry = loop.time() + 30
                    continue

                try:
                    success = await self._send_with_retry(payload)
                    if not success:
                        self._spool_failed_message(payload)
                except asyncio.CancelledError:
                    self._spool_failed_message(payload)
                    raise
                finally:
                    self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error inesperado en worker de cola: %s", e)

    async def _send_with_retry(self, payload: Dict[str, Any], max_retries: int = 3) -> bool:
        """Intenta enviar el payload al backend Spring Boot con backoff exponencial (1s, 2s, 4s)."""
        if "messages" in payload:
            for message in payload["messages"]:
                if not await self._send_with_retry(message, max_retries):
                    return False
            return True
        if not httpx:
            logger.warning("httpx no está instalado; volcando a spool local.")
            return False

        url = f"{settings.BACKEND_API_URL.rstrip('/')}/messages"
        headers = {
            "Content-Type": "application/json",
            "X-Internal-Service-Key": settings.INTERNAL_SERVICE_KEY,
        }

        delays = [1.0, 2.0, 4.0]
        async with httpx.AsyncClient(timeout=5.0) as client:
            for attempt in range(max_retries):
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in [200, 201]:
                        logger.info(
                            "✓ Mensaje persistido en Spring Boot (role=%s, conv_id=%s).",
                            payload.get("role"),
                            payload.get("conversationId"),
                        )
                        return True
                    else:
                        logger.warning(
                            "Intento %d falló con status %d: %s",
                            attempt + 1,
                            resp.status_code,
                            resp.text,
                        )
                except Exception as ex:
                    logger.warning(
                        "Intento %d al contactar Spring Boot (%s) falló: %s",
                        attempt + 1,
                        url,
                        ex,
                    )

                if attempt < max_retries - 1:
                    await asyncio.sleep(delays[attempt])

        return False

    def _spool_failed_message(self, payload: Dict[str, Any]) -> None:
        """Guarda mensajes en archivo de contingencia JSONL para no perder datos."""
        try:
            with open(self._spool_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")
            logger.error("Mensaje guardado en contingencia (%s), turno=%s", self._spool_file, payload.get("turnId") or payload.get("messages", [{}])[0].get("turnId"))
        except Exception as e:
            logger.critical("Error crítico escribiendo en spool de contingencia: %s", e)

    async def _flush_spool_if_possible(self) -> None:
        """Intenta enviar los mensajes pendientes del archivo spool si existe."""
        if not self._spool_file.is_file():
            return

        try:
            with open(self._spool_file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            if not lines:
                return

            logger.info("Intentando recuperar %d mensajes desde spool...", len(lines))
            remaining = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                    success = await self._send_with_retry(payload, max_retries=1)
                    if not success:
                        remaining.append(line)
                except Exception:
                    remaining.append(line)

            if remaining:
                temporary = self._spool_file.with_suffix(".tmp")
                with open(temporary, "w", encoding="utf-8") as f:
                    f.writelines(line + "\n" for line in remaining)
                os.replace(temporary, self._spool_file)
            else:
                self._spool_file.unlink(missing_ok=True)
                logger.info("✓ Todos los mensajes de spool recuperados y sincronizados.")
        except Exception as e:
            logger.warning("Error durante flush de spool: %s", e)

    async def graceful_shutdown(self, worker_task: asyncio.Task, timeout: float = 3.0) -> None:
        """
        Apagado elegante de FastAPI Lifespan.
        Espera a que los mensajes en tránsito terminen o los manda a spool antes de cerrar.
        """
        self._is_running = False
        logger.info("Esperando vaciado de ResilientMessageQueue...")
        try:
            # Esperar a que la cola termine los elementos pendientes
            await asyncio.wait_for(self._queue.join(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("Timeout alcanzado. Volcando mensajes restantes a spool...")
            while not self._queue.empty():
                try:
                    item = self._queue.get_nowait()
                    self._spool_failed_message(item)
                    self._queue.task_done()
                except Exception:
                    break

        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        logger.info("Worker de ResilientMessageQueue detenido limpiamente.")

# Singleton global de la cola resiliente
message_queue = ResilientMessageQueue()
