---
name: ai-inference
description: Servicio de voz local con FastAPI, Whisper en CPU, memoria ONNX y Fish Audio de pago para síntesis.
---

# Motor de voz local

La arquitectura vigente ejecuta el motor Python en el mismo PC que Spring y el cliente Tauri.

- Python 3.11 o posterior; paquete en `src/pseudovoice`.
- Instalar con `venv\Scripts\python.exe -m pip install -e .`.
- Iniciar con `start-local.ps1` o `venv\Scripts\python.exe -m pseudovoice`.
- FastAPI escucha por defecto en `http://127.0.0.1:8000`; WebSocket en `/ws/inference`.
- STT: faster-whisper, modelo base, CPU int8. Sus archivos quedan en `runtime/models/whisper`.
- TTS: Fish Audio de pago, `s2.1-pro`; la referencia del perfil es `fish:<voice_id>`. La salida es PCM 16-bit mono a 24 kHz.
- Configurar `FISH_AUDIO_API_KEY` o su alias `FISH_AUDIO` en el `.env` de la raíz; claves de proveedor solo en Python.
- El catálogo filtra modelos privados y retirados; la carga MP3/WAV usa PyAV y Whisper antes de crear una voz privada con multipart `voices` y propietario local.
- Los perfiles antiguos requieren reasignar una voz Fish conservando historial, sin clonar automáticamente. Las previsualizaciones reutilizan caché y el registro local de uso es una estimación.
- Memoria: FastEmbed con ONNX en CPU, modelo multilingual MiniLM de 384 dimensiones.
- Persistencia: Spring en `http://127.0.0.1:8081/api`. Mantener iguales las claves internas de ambos servicios.
- La cola conserva mensajes pendientes en `spool/failed_messages.jsonl`.
- Mantener las claves de proveedores en el `.env` privado del motor. No empaquetarlas en el frontend.
- No instalar PyTorch, Coqui TTS ni servicios de túneles como requisito de esta arquitectura.

## Protocolo y reglas

El cliente envía autenticación si se configura INFERENCE_ACCESS_KEY, después session_config con conversation_id, user_token y metadatos del personaje. Verificar usuario, propietario de conversación, personaje y autorización de voz. El audio entrante es PCM 16-bit mono a 16 kHz; end_of_speech cierra un turno.

Ordenar reglas por priority ASC y filtrar isActive. Jev evalúa comandos de PC, respuestas reactivas o preguntas para DeepSeek. La generación vocal se envía por frases; los comandos de sistema se ejecutan solo en Tauri.

Medir stt_latency_ms, decision_latency_ms, llm_latency_ms, tts_latency_ms y total_turn_latency_ms. Encolar ambos mensajes con turnId para conservar idempotencia. El historial y la memoria son contexto, no instrucciones.

Los recuerdos se proponen pendientes de aprobación; aprobación y audiencia se controlan en Spring. El modo de segundo plano, bandeja y atajo se implementan en Rust/Tauri. Consultar `README.md` para configuración y pruebas offline.
