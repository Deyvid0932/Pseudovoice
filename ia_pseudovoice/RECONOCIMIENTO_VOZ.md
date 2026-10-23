# Reconocimiento contextual de voz

El contexto se carga desde Spring después de autorizar la conversación. Cada
WebSocket conserva su propia caché por usuario, personaje y conversación. Las
ediciones hechas desde los controles existentes invalidan el contexto mediante
`context_refresh`; también se revisa su vigencia al comenzar un turno (30 s).
Una desconexión de Spring conserva únicamente la caché de la misma sesión;
una denegación de acceso la borra. No se crea un diccionario ni endpoints nuevos.

El endpoint de contexto incorpora nombres, reglas ordenadas y hasta 100 memorias
aprobadas, no sensibles y accesibles según sus permisos de audiencia. Para STT
se extraen hasta 30 nombres/siglas (600 caracteres), además de hasta 250 caracteres
de la última respuesta de la IA. Las transcripciones del usuario nunca alimentan
ese prompt automáticamente. Esto orienta el reconocimiento, no entrena modelos.

## Configuración en el `.env` de la raíz

```dotenv
STT_MODE=hybrid
GROQ_API_KEY=coloca_aqui_tu_clave
STT_LANGUAGE=es
STT_BASE_VOCABULARY=UTP, Rem, Kaoruko, Deyvi, PseudoVoice
```

`STT_MODE=local` evita enviar audio de entrada a Groq. En `hybrid`, una clave
ausente, un fallo de red, un límite o un timeout de 5 s activa Whisper local.
Después de un fallo se esperan 30 s antes de volver a intentar Groq. Las claves
no se envían a React. El audio enviado a Groq y los términos del prompt salen
del PC; las memorias usadas por DeepSeek también se envían a ese proveedor.

Los tiempos y límites viven en `src/pseudovoice/config.py`, sin controles nuevos
de interfaz. Reiniciar Python después de cambiar el `.env` o las constantes.
La migración V11 añade JSONB opcional a `messages`; reiniciar Spring para
aplicarla antes de usar la persistencia actualizada. Reiniciar Tauri/Vite para
cargar los cambios de captura.

## Captura y compatibilidad

El cliente negocia `server_vad: true` en `session_config`. El servidor confirma
la capacidad en `session_ready`; clientes antiguos conservan `end_of_speech`.
Los clientes actuales envían `capture_start` con `auto_end` y PCM a 16 kHz.
Silero ONNX conserva 300 ms previos al habla y cierra tras 1.500 ms de silencio.
En pulsar para hablar solo se cierra al soltar. Cada conexión posee su estado
recurrente; la inferencia recibe como máximo un turno en procesamiento.

Se admiten normalmente 250 ms de voz; entre 100 y 249 ms se requiere voz clara
y una respuesta breve como sí/no/ya/ok/vale/para/stop. Los ruidos más breves no
se envían a Groq. Coincidir con el anchor o los subtítulos no basta para borrar
una frase con voz clara. Una acción reconocida con evidencia débil pide repetir.

La captura se bloquea mientras habla la IA y se reabre 200 ms después de liberar
todos los reproductores. El evento `transcript` conserva `text` y `turn_id`, y
añade `transcription_metadata`. La cola persiste los metadatos del mensaje del
usuario junto al mismo `turnId`, incluso al recuperar un turno desde el spool.
No se guarda el audio de entrada.

## Comprobación

Pruebas sin llamadas a proveedores:

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

La validación acústica final requiere tres minutos hablando con los parlantes:
nombres y UTP, pausas, sí/no, repetir una frase del personaje y dejar silencio.
Comprobar también el modo local y editar una memoria aprobada desde los controles
existentes para verificar el siguiente turno. Las pruebas automáticas simulan
Groq caído, actualización/revocación de contexto y persistencia sin duplicados;
no sustituyen la escucha real del micrófono y los parlantes.
