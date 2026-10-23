# Configuración local del backend

Spring carga automáticamente `../.env` (ruta relativa al directorio de trabajo `pseudovoice-auth`). Python y Vite también leen ese archivo desde la raíz. No copies ni publiques el `.env`.

Los secretos exclusivos del backend, como `APP_JWT_SECRET`, se guardan en el `.env` de la raíz. Conserva el mismo valor entre reinicios para mantener válidos los tokens existentes.

- `DB_URL` (opcional; por defecto `jdbc:postgresql://localhost:5432/asistente_ia`)
- `DB_USERNAME` (opcional; por defecto `postgres`)
- `DB_PASSWORD` (obligatoria; contraseña actual de PostgreSQL)
- `GOOGLE_CLIENT_ID` (obligatorio; el mismo Client ID OAuth de tipo Aplicación web que `VITE_GOOGLE_CLIENT_ID` en el frontend)
- `INTERNAL_SERVICE_KEY` (la misma clave del motor Python; mínimo 32 caracteres)
- `APP_JWT_SECRET` (secreto HMAC independiente; mínimo 32 bytes)

Define `APP_JWT_SECRET` y `DB_PASSWORD` en el `.env` de la raíz. No reutilices `INTERNAL_SERVICE_KEY` como `APP_JWT_SECRET`: genera un secreto de firma independiente. La respuesta de `POST /api/auth/google` devuelve el JWT de la aplicación, con una validez de 12 horas. Las demás rutas `/api/**` requieren `Authorization: Bearer <accessToken>`; el motor conserva la autenticación separada mediante `X-Internal-Service-Key`.

La configuración ya no contiene la contraseña de la base ni claves predeterminadas. Si el proyecto estuvo compartido con la contraseña anterior en `application.properties`, cámbiala en PostgreSQL y actualiza `DB_PASSWORD` antes de volver a usarlo. Cada usuario nuevo recibe el rol persistido `USER`; `ADMIN` solo debe asignarse manualmente por un administrador de la base y nunca desde un parámetro del endpoint de login.
