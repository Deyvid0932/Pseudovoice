# Conectar registro e inicio de sesión con Google

El formulario del cliente usa Google Identity Services. El backend crea la cuenta automáticamente al primer acceso verificado y responde con un JWT propio; no se captura ni guarda una contraseña de Google.

1. En [Google Cloud Console](https://console.cloud.google.com/), crea o selecciona un proyecto.
2. Configura **Google Auth Platform** (pantalla de consentimiento). Si está en modo de prueba, añade el correo de Google que usarás como usuario de prueba.
3. Ve a **Clientes** / **Credentials** y crea un **OAuth client ID** de tipo **Web application**.
4. En **Authorized JavaScript origins**, añade `http://localhost` y el origen exacto del frontend local `http://localhost:1420`. Si también ejecutas Vite directamente en su puerto habitual, añade `http://localhost:5173`. Google pide registrar los orígenes locales con su puerto para pruebas.
5. No hace falta configurar un redirect URI para este flujo de ventana emergente de Google Identity Services.
6. Copia el Client ID (no el Client Secret) en el `.env` de la raíz:

   ```dotenv
   VITE_GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
   VITE_API_URL=http://localhost:8081/api
   ```

7. Usa el mismo Client ID en `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID`. Reinicia Vite y Spring después de cambiar variables.
8. Abre `http://localhost:1420`, elige **Crear cuenta** y completa la ventana de Google. La primera autenticación crea el usuario en PostgreSQL; el siguiente acceso inicia sesión en esa cuenta.

Para un dominio publicado, registra su origen HTTPS autorizado en Google Cloud y cambia `VITE_API_URL` al endpoint HTTPS del backend. Para empaquetar como aplicación Tauri, valida el flujo OAuth en la ventana WebView de destino; si Google bloquea el popup embebido, hay que pasar a OAuth en navegador del sistema con deep-link de retorno, en vez de añadir un redirect arbitrario.

El `Client ID` es identificador público y se puede usar en el frontend. Nunca pongas el `Client Secret`, la `INTERNAL_SERVICE_KEY` ni `APP_JWT_SECRET` en `VITE_*` o en el código cliente.
