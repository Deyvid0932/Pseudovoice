import asyncio
import json
import logging
from typing import AsyncIterator, Callable, List, Optional

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    httpx = None
    HTTPX_AVAILABLE = False

try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    websockets = None
    WEBSOCKETS_AVAILABLE = False

from .config import settings
from .prompt_builder import build_system_prompt
from .router import LocalIntentRouter
from .session import PCCommand, Rule, RoutingDecision, SessionConfig, TelemetryMetrics


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("pseudovoice.client_orchestrator")


class InferenceClient:
    """
    Cliente ligero y orquestador que se ejecuta en el entorno local (Windows).
    Se comunica con el servicio de voz local por HTTP y WebSocket.
    """

    def __init__(self, base_url: Optional[str] = None):
        raw_url = base_url or f"http://127.0.0.1:{settings.PORT}"
        self.base_url = raw_url.rstrip("/")
        self.ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://") + "/ws/inference"
        self.http_client = httpx.AsyncClient(base_url=self.base_url, timeout=10.0) if HTTPX_AVAILABLE else None
        self.router = LocalIntentRouter()
        self.websocket = None

    async def check_health(self) -> dict:
        if not self.http_client:
            return {"status": "error", "error": "httpx no está instalado. Ejecuta 'pip install -r requirements.txt'"}
        try:
            resp = await self.http_client.get("/health")
            if resp.status_code == 200:
                logger.info("Motor local en línea: %s", resp.json())
                return resp.json()
            return {"status": "error", "code": resp.status_code}
        except Exception as e:
            logger.warning("No se pudo contactar el servidor local en %s: %s", self.base_url, e)
            return {"status": "offline", "error": str(e)}


    async def connect_websocket(self) -> bool:
        try:
            logger.info("Conectando WebSocket a %s...", self.ws_url)
            self.websocket = await websockets.connect(self.ws_url)
            if settings.INFERENCE_ACCESS_KEY:
                await self.websocket.send(json.dumps({"type": "auth", "token": settings.INFERENCE_ACCESS_KEY}))
                response = json.loads(await asyncio.wait_for(self.websocket.recv(), timeout=10))
                if response.get("type") != "authenticated":
                    await self.websocket.close()
                    self.websocket = None
                    return False
            logger.info("✓ Conexión WebSocket establecida con el servicio local.")
            return True
        except Exception as e:
            logger.error("Error conectando a WebSocket local: %s", e)
            return False

    async def configure_session(
        self,
        character_id: int,
        reference_audio_name: str,
        rules: List[Rule],
        conversation_id: int,
        user_token: str = "",
    ) -> bool:
        if not self.websocket:
            logger.error("WebSocket no conectado.")
            return False

        config_payload = {
            "type": "session_config",
            "conversation_id": conversation_id,
            "user_token": user_token,
            "data": {
                "character_id": character_id,
                "reference_audio_name": reference_audio_name,
                "character_rules": [r.model_dump() for r in rules],
            },
        }
        await self.websocket.send(json.dumps(config_payload))
        response = await self.websocket.recv()
        logger.info("Respuesta de configuración de sesión: %s", response)
        return json.loads(response).get("type") == "session_ready"

    async def send_audio_chunk(self, pcm_bytes: bytes):
        if self.websocket:
            await self.websocket.send(pcm_bytes)

    async def signal_end_of_speech(self):
        if self.websocket:
            await self.websocket.send(json.dumps({"type": "end_of_speech"}))

    async def listen_responses(
        self,
        on_audio_chunk: Optional[Callable[[bytes], None]] = None,
        on_event: Optional[Callable[[dict], None]] = None,
    ):

        if not self.websocket:
            return

        while True:
            try:
                msg = await self.websocket.recv()
                if isinstance(msg, bytes):
                    if on_audio_chunk:
                        on_audio_chunk(msg)
                else:
                    data = json.loads(msg)
                    if on_event:
                        on_event(data)


                    if data.get("type") in ["turn_complete", "error"]:
                        break
            except websockets.ConnectionClosed:
                logger.info("Conexión WebSocket cerrada.")
                break

    async def close(self):
        """Cierra conexiones activas."""
        if self.websocket:
            await self.websocket.close()
        if self.http_client:
            await self.http_client.aclose()
