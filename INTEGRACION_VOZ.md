# Voz local de PseudoVoice

El cliente React/Tauri conecta con Spring y el servicio Python en tu PC:
micrófono PCM 16 kHz → Whisper CPU → reglas de Jev o DeepSeek →
Fish Audio de pago, `s2.1-pro` (PCM 24 kHz) → reproducción en el cliente.

## Inicio

1. Inicia PostgreSQL y `pseudovoice-auth` en el puerto 8081 con su configuración
   privada de base de datos y autenticación.
2. Desde la raíz del proyecto, ejecuta en PowerShell:
   ` .\ia_pseudovoice\start-local.ps1 `.
   Para instalar o actualizar dependencias usa el parámetro `-Install`.
   El script crea el entorno con Python 3.11 si todavía no existe.
3. Desde `desktop-client`, ejecuta `npm run dev` para probar en navegador.
   Usa `npm run tauri dev` para la aplicación nativa, con Rust instalado.
4. Inicia sesión con Google, crea un personaje y selecciona una voz pública
   de Fish o registra una muestra propia/autorizada; abre una conversación
   y activa el micrófono.

El servicio de voz escucha únicamente en `http://127.0.0.1:8000`.
Su WebSocket es `ws://127.0.0.1:8000/ws/inference`;
Spring usa `http://127.0.0.1:8081/api`. No necesitas publicar estos servicios.

## Configuración privada

Mantén el `.env` de la raíz fuera del control de versiones:

- `FISH_AUDIO_API_KEY` (alias `FISH_AUDIO`): clave del proveedor, solo en Python.
- `FISH_AUDIO_MODEL=s2.1-pro`: modelo de pago para síntesis.
- `DEEPSEEK_API_KEY`: necesaria para respuestas complejas del LLM.
- `BACKEND_API_URL=http://127.0.0.1:8081/api`.
- `INTERNAL_SERVICE_KEY`: el mismo valor privado en Spring y Python.
- `INFERENCE_ACCESS_KEY`: autentica HTTP/WebSocket; Vite la lee para el cliente local.
- `DEVICE=cpu`, `COMPUTE_TYPE=int8`, `WHISPER_MODEL_SIZE=base`.

No coloques claves de proveedores en variables `VITE_*`: quedan visibles en
el cliente. El identificador público de Google sí va en
`VITE_GOOGLE_CLIENT_ID`; el inicio de sesión web requiere un cliente OAuth web
y el origen exacto autorizado (por ejemplo `http://localhost:1420`).

Fish requiere acceso de pago y saldo para sintetizar. HTTP 401 indica clave
rechazada, 402 saldo/acceso de pago insuficiente, 403 voz u operación no
permitida y 429 límite de concurrencia. Explorar voces filtra modelos privados
y retirados. La carga MP3/WAV se decodifica con PyAV y Whisper verifica voz
antes de crear un modelo privado con multipart `voices`; se registra su propietario.
Las pruebas verifican este contrato con HTTP simulado, sin llamadas pagadas.

## Persistencia

`ia_pseudovoice/runtime` guarda modelos descargados,
metadatos de propietario de voz y caché de audio. La primera ejecución descarga Whisper;
el modelo de embeddings se descarga al utilizar la memoria semántica.
Cerrar la aplicación no elimina estos archivos.

Spring persiste usuarios, personajes, conversaciones y memoria en PostgreSQL.
Los mensajes pendientes se conservan en
`ia_pseudovoice/spool/failed_messages.jsonl` y se reintentan cuando Spring vuelve.
No borres `runtime`, `spool` ni los datos de PostgreSQL si quieres conservarlos.

La memoria usa embeddings multilingües de 384 dimensiones mediante FastEmbed
en CPU. Los perfiles nuevos guardan referencias `fish:<voice_id>`.
Un perfil antiguo requiere reasignar una voz Fish en Explorar voces, conservando
personaje e historial. No se inicia una clonación automática.

Los recuerdos se proponen pendientes de aprobación; el usuario controla su
aprobación y audiencia en Spring. HTTP y WebSocket verifican usuario y
autorización de voz; la sesión también verifica propietario de la conversación
y personaje. Las previsualizaciones reutilizan caché por voz/modelo/texto;
`runtime/fish_usage.jsonl` registra estimaciones locales de uso, no facturación.

El modo de segundo plano lo controla Rust/Tauri: al activarlo, cerrar oculta
la ventana. La bandeja permite recuperar la aplicación y el atajo controla
la captura de voz. Sin ese modo, cerrar detiene la captura.

## Verificación y límites

`GET /health` informa si la transcripción está lista y si las claves están
configuradas; no garantiza que el proveedor externo tenga permisos/créditos.
Ejecuta las pruebas con:

` .\ia_pseudovoice\venv\Scripts\python.exe -m unittest discover -s ia_pseudovoice/tests `

En CPU la transcripción puede tardar más que con una GPU. Los turnos se
transcriben al finalizar el habla: no es voz full-duplex. Las respuestas por
frases siguen usando la API externa y requieren Internet. El navegador sirve
para probar conversación; las acciones del sistema operativo requieren Tauri.
