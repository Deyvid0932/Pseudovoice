# Servicio de voz local

Python ejecuta FastAPI y Whisper en CPU (int8); Fish Audio produce la voz con el modelo de pago `s2.1-pro`. Spring conserva usuarios, personajes, conversaciones y memoria; React/Tauri reproduce PCM 16-bit mono a 24 kHz. El audio entrante es PCM mono a 16 kHz.

Desde la raíz del repositorio ejecuta `.\ia_pseudovoice\start-local.ps1 -Install` para instalar y arrancar. El servicio escucha en `http://127.0.0.1:8000` y usa `/ws/inference`; Spring escucha en `http://127.0.0.1:8081/api`. DeepSeek atiende las respuestas complejas.

## Configuración

Guarda la configuración de los tres servicios en el `.env` privado de la raíz del proyecto:

```dotenv
FISH_AUDIO_API_KEY=tu_clave
FISH_AUDIO_MODEL=s2.1-pro
DEEPSEEK_API_KEY=tu_clave
BACKEND_API_URL=http://127.0.0.1:8081/api
INTERNAL_SERVICE_KEY=misma_clave_que_Spring
INFERENCE_ACCESS_KEY=clave_local_de_al_menos_32_caracteres
```

`FISH_AUDIO` es un alias de `FISH_AUDIO_API_KEY`; si defines ambos, prevalece `FISH_AUDIO_API_KEY`. Las claves de Fish y DeepSeek solo las consume Python. La síntesis requiere acceso de pago y saldo del proveedor; un resultado correcto de `/health` solo indica configuración y disponibilidad local, no verifica crédito.

## Automatización web (fase inicial)

El Modo agente es independiente del chat normal. Requiere habilitarlo en Configuración → Control del PC y automatizaciones, tener Spring y FastAPI activos y configurar el endpoint local de Playwright MCP (`PLAYWRIGHT_MCP_URL`). El servidor MCP debe exponer herramientas Playwright estructuradas; no se permite `browser_run_code_unsafe`, evaluación arbitraria ni comandos de sistema. Como la instancia MCP configurada comparte navegador, FastAPI serializa las tareas para evitar que se crucen sus navegaciones.

Para aplicar el tope de gasto por tarea, configura `DEEPSEEK_INPUT_USD_PER_MILLION_TOKENS` y `DEEPSEEK_OUTPUT_USD_PER_MILLION_TOKENS` con las tarifas vigentes de tu cuenta/modelo. Si ambas no son positivas, el modo agente se detiene antes de iniciar; no inventa tarifas. Los ajustes del usuario definen el tope separado de DeepSeek y Fish, y el máximo de pasos (15). Fish Audio no se invoca en la fase actual de automatización.

Las lecturas y escrituras se controlan por preferencias; cada escritura requiere aprobación de un solo uso ligada al contenido exacto y vence en cinco minutos. La navegación solo admite HTTPS público; WhatsApp está fuera de alcance en esta fase. Al reiniciarse FastAPI, cerrarse Tauri o perderse MCP, las tareas quedan para revisión. Una acción externa incierta nunca se reintenta automáticamente. El historial técnico se conserva hasta siete días; chats y memorias no se eliminan por esa política.

## Voces y sesiones

Explorar voces consulta `/voices/catalog`, que filtra voces privadas y retiradas. Las referencias guardadas son `fish:<voice_id>`. Las portadas `coverimage/...` se convierten a URLs HTTPS del almacenamiento público de Fish.

La carga acepta MP3/WAV de hasta 20 MB: PyAV decodifica el audio real y lo normaliza a WAV mono 24 kHz. Se rechazan archivos corruptos, silencio, muestras menores de un segundo o mayores de tres minutos; Whisper debe reconocer voz antes de crear el modelo privado. La creación usa multipart `voices` y guarda el propietario en `runtime/voices/<voice_id>.fish.json`.

Los perfiles antiguos requieren seleccionar una voz Fish. Reasignar la voz conserva el personaje y su historial; no inicia una clonación automática. Las voces privadas solo pueden usarse por su propietario.

HTTP usa la clave del motor en `Authorization` y el JWT del usuario en `X-User-Authorization`. WebSocket autentica el motor y recibe `user_token` junto con `session_config`; valida usuario, conversación, personaje y autorización de la voz antes de cargar historial.

`POST /voices/preview` devuelve WAV. La caché en `runtime/audio_cache` depende de voz, modelo y texto; una repetición reutiliza PCM y vuelve a verificar permisos. `runtime/fish_usage.jsonl` registra bytes UTF-8 y segundos sintetizados solamente en solicitudes nuevas exitosas. Es una estimación local de uso, no una factura ni una consulta del saldo.

## Memoria y cliente nativo

FastEmbed/ONNX produce embeddings multilingües de 384 dimensiones en CPU. La extracción con DeepSeek reúne seis turnos o espera dos minutos de inactividad antes de analizar un bloque; no hace una llamada de extracción por cada mensaje. El modo `suggested` (predeterminado para conservar el comportamiento anterior) crea propuestas pendientes; `automatic` guarda recuerdos aprobados y privados; `manual` desactiva la extracción. Cambia el modo en Memorias → Preferencias. Las memorias permanecen separadas por personaje; compartir entre personajes requiere habilitarlo y seleccionar un grupo o alcance compartido.

La actividad registra creaciones, actualizaciones, recuperaciones y el uso de tokens. El botón Deshacer revierte una memoria extraída solo si nadie la editó después. El costo se estima con `MEMORY_INPUT_USD_PER_MILLION_TOKENS` y `MEMORY_OUTPUT_USD_PER_MILLION_TOKENS`; déjalas en cero para mostrar el consumo de tokens sin simular precios. Si el proveedor no informa tokens, el motor conserva una estimación aproximada por caracteres.

Los datos sensibles nunca se indexan ni se añaden a la recuperación para DeepSeek. Solo se pueden guardar si la persona activa el consentimiento correspondiente y Spring tiene `MEMORY_ENCRYPTION_KEY`, una clave Base64 aleatoria de 32 bytes. Mantén esa clave fuera del repositorio y conserva una copia segura: si se pierde o se rota, los recuerdos sensibles guardados con ella no podrán descifrarse. Genera una con PowerShell: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` y configúrala en el `.env` de la raíz.

Las instrucciones compartidas se consultan por turno. Los mensajes sin persistir quedan en `spool/failed_messages.jsonl` para reintentar.

El modo de segundo plano se implementa en Rust/Tauri. Activarlo permite ocultar la ventana al cerrarla y recuperar la aplicación mediante bandeja; el atajo controla la captura de voz. Con el modo desactivado, cerrar detiene la captura. Las acciones del sistema operativo requieren el cliente nativo.

## Pruebas

Desde la raíz del repositorio:

```powershell
.\ia_pseudovoice\venv\Scripts\python.exe -m unittest discover -s ia_pseudovoice/tests -v
```

Las pruebas generan MP3/WAV genuinos con PyAV y simulan HTTP de Fish, Whisper y verificaciones de sesión de Spring. No descargan modelos ni ejecutan llamadas pagadas. `tests/test_client.py` es un diagnóstico manual de lectura del servicio local en ejecución, separado de los casos automáticos.
