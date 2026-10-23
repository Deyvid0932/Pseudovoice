use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;
use uuid::Uuid;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAuthorization {
    authorization_code: String,
    code_verifier: String,
    redirect_uri: String,
}

struct OAuthCallback {
    code: String,
    state: String,
}

#[tauri::command]
pub async fn google_desktop_login(
    app: AppHandle,
    client_id: String,
) -> Result<DesktopAuthorization, String> {
    let client_id = client_id.trim().to_owned();
    if !client_id.ends_with(".apps.googleusercontent.com") {
        return Err("Configura VITE_GOOGLE_DESKTOP_CLIENT_ID con el ID OAuth de tipo Aplicación de escritorio.".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("No se pudo preparar el retorno local de Google: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("No se pudo configurar el retorno local: {e}"))?;
    let redirect_uri = format!("http://127.0.0.1:{}/", listener.local_addr().map_err(|e| e.to_string())?.port());
    let verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let state = Uuid::new_v4().simple().to_string();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let mut auth_url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|e| e.to_string())?;
    auth_url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| format!("No se pudo abrir el navegador del sistema: {e}"))?;

    let callback = tauri::async_runtime::spawn_blocking(move || receive_callback(listener))
        .await
        .map_err(|e| format!("Falló el retorno de Google: {e}"))??;

    if callback.state != state {
        return Err("La respuesta de Google no coincide con esta solicitud de inicio de sesión.".into());
    }

    Ok(DesktopAuthorization {
        authorization_code: callback.code,
        code_verifier: verifier,
        redirect_uri,
    })
}

fn receive_callback(listener: TcpListener) -> Result<OAuthCallback, String> {
    let deadline = Instant::now() + Duration::from_secs(300);
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("Se agotó el tiempo para completar el acceso con Google.".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("No se recibió el retorno de Google: {error}")),
        }
    };
    stream
        .set_read_timeout(Some(Duration::from_secs(300)))
        .map_err(|e| e.to_string())?;
    let request = read_request(&mut stream)?;
    let callback_url = Url::parse(&format!("http://127.0.0.1{request}"))
        .map_err(|_| "Google devolvió una dirección de retorno inválida.".to_string())?;
    let values = callback_url.query_pairs().into_owned().collect::<std::collections::HashMap<_, _>>();
    let response = if values.contains_key("code") {
        "<!doctype html><meta charset=utf-8><title>PseudoVoice</title><h2>Acceso completado</h2><p>Vuelve a PseudoVoice. Puedes cerrar esta pestaña.</p>"
    } else {
        "<!doctype html><meta charset=utf-8><title>PseudoVoice</title><h2>No se completó el acceso</h2><p>Vuelve a PseudoVoice e inténtalo de nuevo.</p>"
    };
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response.len(),
        response
    );
    let _ = stream.write_all(http_response.as_bytes());
    let code = values
        .get("code")
        .cloned()
        .ok_or_else(|| "Google canceló o rechazó el inicio de sesión.".to_string())?;
    let state = values
        .get("state")
        .cloned()
        .ok_or_else(|| "La respuesta de Google no incluyó el estado de seguridad.".to_string())?;
    Ok(OAuthCallback { code, state })
}

fn read_request(stream: &mut TcpStream) -> Result<String, String> {
    let mut buffer = [0_u8; 8192];
    let length = stream
        .read(&mut buffer)
        .map_err(|e| format!("No se pudo leer el retorno de Google: {e}"))?;
    let request = String::from_utf8_lossy(&buffer[..length]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "El retorno local de Google está mal formado.".to_string())?;
    if !target.starts_with("/?") {
        return Err("Google devolvió una ruta local inesperada.".into());
    }
    Ok(target.to_owned())
}
