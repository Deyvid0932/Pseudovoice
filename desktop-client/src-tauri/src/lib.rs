use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
mod desktop;
mod desktop_auth;
mod generated_audio;
use desktop::DesktopState;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

enum AudioRequest {
    Start(
        AppHandle,
        u64,
        std::sync::mpsc::Sender<Result<String, String>>,
    ),
    Stop(std::sync::mpsc::Sender<Result<String, String>>),
    Shutdown(std::sync::mpsc::Sender<Result<String, String>>),
}

struct AudioCaptureState {
    requests: Mutex<std::sync::mpsc::Sender<AudioRequest>>,
    generation: Arc<AtomicU64>,
    shutting_down: AtomicBool,
}

enum SampleAudioRequest {
    Start(std::sync::mpsc::Sender<Result<String, String>>),
    Stop(std::sync::mpsc::Sender<Result<Vec<i16>, String>>),
}

struct SampleAudioState {
    requests: Mutex<std::sync::mpsc::Sender<SampleAudioRequest>>,
}

struct SampleAudioCapture {
    stream: cpal::Stream,
    samples: Arc<Mutex<Vec<i16>>>,
}

impl Default for SampleAudioState {
    fn default() -> Self {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut capture: Option<SampleAudioCapture> = None;
            while let Ok(request) = rx.recv() {
                match request {
                    SampleAudioRequest::Start(reply) => {
                        let result = if capture.is_some() {
                            Err("Ya hay una grabación de muestra activa.".into())
                        } else {
                            create_sample_audio_stream().and_then(|new_capture| {
                                new_capture.stream.play().map_err(|error| format!("No se pudo iniciar el micrófono: {error}"))?;
                                capture = Some(new_capture);
                                Ok("Grabación de muestra iniciada.".into())
                            })
                        };
                        let _ = reply.send(result);
                    }
                    SampleAudioRequest::Stop(reply) => {
                        let result = match capture.take() {
                            Some(active) => {
                                drop(active.stream);
                                active.samples.lock().map(|samples| samples.clone()).map_err(|_| "No se pudo leer la muestra de audio.".into())
                            }
                            None => Err("No hay ninguna grabación de muestra activa.".into()),
                        };
                        let _ = reply.send(result);
                    }
                }
            }
        });
        Self { requests: Mutex::new(tx) }
    }
}

struct CapturedAudio {
    stream: cpal::Stream,
    tail: Arc<Mutex<Vec<i16>>>,
    app: AppHandle,
}

impl CapturedAudio {
    fn stop(self) -> Result<(), String> {
        // Stop/join callbacks before draining their shared tail buffer.
        drop(self.stream);
        let chunk = std::mem::take(
            &mut *self
                .tail
                .lock()
                .map_err(|_| "Buffer de audio no disponible")?,
        );
        if !chunk.is_empty() {
            self.app
                .emit("voice-pcm", chunk)
                .map_err(|e| format!("No se pudo enviar el bloque final de PCM: {e}"))?;
        }
        Ok(())
    }
}

fn stop_stream(stream: &mut Option<CapturedAudio>) -> Result<String, String> {
    if let Some(capture) = stream.take() {
        capture.stop()?;
    }
    Ok("Captura de micrófono detenida.".into())
}

impl Default for AudioCaptureState {
    fn default() -> Self {
        let (tx, rx) = std::sync::mpsc::channel();
        let generation = Arc::new(AtomicU64::new(0));
        let worker_generation = generation.clone();
        // CPAL streams are not Send on every platform; keep ownership on one thread.
        std::thread::spawn(move || {
            let mut stream: Option<CapturedAudio> = None;
            while let Ok(request) = rx.recv() {
                match request {
                    AudioRequest::Start(app, requested_generation, reply) => {
                        let result = if worker_generation.load(Ordering::SeqCst)
                            != requested_generation
                        {
                            Err("Inicio de captura cancelado por una solicitud de parada.".into())
                        } else if stream.is_some() {
                            Ok("El micrófono ya está capturando.".into())
                        } else if app.state::<DesktopState>().paused.load(Ordering::SeqCst) {
                            Err("La captura de voz está pausada desde la bandeja.".into())
                        } else {
                            create_audio_stream(app).and_then(|new_stream| {
                                if worker_generation.load(Ordering::SeqCst) != requested_generation
                                {
                                    return Err(
                                        "Inicio de captura cancelado por una solicitud de parada."
                                            .into(),
                                    );
                                }
                                new_stream
                                    .stream
                                    .play()
                                    .map_err(|e| format!("No se pudo iniciar el micrófono: {e}"))?;
                                stream = Some(new_stream);
                                Ok("Captura PCM nativa activa a 16 kHz mono.".into())
                            })
                        };
                        let _ = reply.send(result);
                    }
                    AudioRequest::Stop(reply) => {
                        let _ = reply.send(stop_stream(&mut stream));
                    }
                    AudioRequest::Shutdown(reply) => {
                        let _ = reply.send(stop_stream(&mut stream));
                        break;
                    }
                }
            }
        });
        Self {
            requests: Mutex::new(tx),
            generation,
            shutting_down: AtomicBool::new(false),
        }
    }
}

fn build_input_stream<T, F>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    input_rate: u32,
    app: AppHandle,
    tail: Arc<Mutex<Vec<i16>>>,
    to_f32: F,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + Copy + 'static,
    F: Fn(T) -> f32 + Send + 'static,
{
    let mut rate_accumulator = 0u64;
    device
        .build_input_stream(
            config,
            move |input: &[T], _| {
                let Ok(mut pcm_chunk) = tail.lock() else {
                    return;
                };
                for frame in input.chunks_exact(channels) {
                    let mono =
                        frame.iter().map(|sample| to_f32(*sample)).sum::<f32>() / channels as f32;
                    rate_accumulator += 16_000;
                    while rate_accumulator >= input_rate as u64 {
                        pcm_chunk.push((mono.clamp(-1.0, 1.0) * 32767.0) as i16);
                        rate_accumulator -= input_rate as u64;
                        if pcm_chunk.len() >= 2048 {
                            let chunk =
                                std::mem::replace(&mut *pcm_chunk, Vec::with_capacity(2048));
                            if let Err(error) = app.emit("voice-pcm", chunk) {
                                eprintln!("No se pudo enviar PCM al cliente: {error}");
                            }
                        }
                    }
                }
            },
            move |error| eprintln!("Error del dispositivo de audio: {error}"),
            None,
        )
        .map_err(|error| format!("No se pudo abrir el micrófono: {error}"))
}

fn create_audio_stream(app: AppHandle) -> Result<CapturedAudio, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No hay un micrófono de entrada predeterminado.")?;
    let supported = device
        .default_input_config()
        .map_err(|error| format!("No se pudo leer la configuración del micrófono: {error}"))?;
    let channels = supported.channels() as usize;
    let input_rate = supported.sample_rate().0;
    let config: cpal::StreamConfig = supported.clone().into();

    let tail = Arc::new(Mutex::new(Vec::with_capacity(2048)));
    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_input_stream::<f32, _>(
            &device,
            &config,
            channels,
            input_rate,
            app.clone(),
            tail.clone(),
            |sample| sample,
        ),
        cpal::SampleFormat::I16 => build_input_stream::<i16, _>(
            &device,
            &config,
            channels,
            input_rate,
            app.clone(),
            tail.clone(),
            |sample| sample as f32 / 32768.0,
        ),
        cpal::SampleFormat::U16 => build_input_stream::<u16, _>(
            &device,
            &config,
            channels,
            input_rate,
            app.clone(),
            tail.clone(),
            |sample| (sample as f32 - 32768.0) / 32768.0,
        ),
        format => Err(format!(
            "Formato de audio del micrófono no soportado: {format:?}"
        )),
    }?;
    Ok(CapturedAudio { stream, tail, app })
}

fn build_sample_input_stream<T, F>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    input_rate: u32,
    samples: Arc<Mutex<Vec<i16>>>,
    to_f32: F,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + Copy + 'static,
    F: Fn(T) -> f32 + Send + 'static,
{
    let mut rate_accumulator = 0u64;
    device.build_input_stream(
        config,
        move |input: &[T], _| {
            let Ok(mut output) = samples.lock() else { return; };
            for frame in input.chunks_exact(channels) {
                let mono = frame.iter().map(|sample| to_f32(*sample)).sum::<f32>() / channels as f32;
                rate_accumulator += 16_000;
                while rate_accumulator >= input_rate as u64 {
                    if output.len() >= 16_000 * 20 { return; }
                    output.push((mono.clamp(-1.0, 1.0) * 32767.0) as i16);
                    rate_accumulator -= input_rate as u64;
                }
            }
        },
        move |error| eprintln!("Error grabando muestra de voz: {error}"),
        None,
    ).map_err(|error| format!("No se pudo abrir el micrófono: {error}"))
}

fn create_sample_audio_stream() -> Result<SampleAudioCapture, String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("Windows no detecta un micrófono de entrada predeterminado.")?;
    let supported = device.default_input_config().map_err(|error| format!("No se pudo leer la configuración del micrófono: {error}"))?;
    let channels = supported.channels() as usize;
    let input_rate = supported.sample_rate().0;
    let config: cpal::StreamConfig = supported.clone().into();
    let samples = Arc::new(Mutex::new(Vec::with_capacity(16_000 * 12)));
    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_sample_input_stream::<f32, _>(&device, &config, channels, input_rate, samples.clone(), |sample| sample),
        cpal::SampleFormat::I16 => build_sample_input_stream::<i16, _>(&device, &config, channels, input_rate, samples.clone(), |sample| sample as f32 / 32768.0),
        cpal::SampleFormat::U16 => build_sample_input_stream::<u16, _>(&device, &config, channels, input_rate, samples.clone(), |sample| (sample as f32 - 32768.0) / 32768.0),
        format => Err(format!("Formato de audio del micrófono no soportado: {format:?}")),
    }?;
    Ok(SampleAudioCapture { stream, samples })
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn start_voice_capture(app: AppHandle) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let capture = app.state::<AudioCaptureState>();
    if capture.shutting_down.load(Ordering::SeqCst) {
        return Err("La aplicación está cerrándose.".into());
    }
    let generation = capture.generation.load(Ordering::SeqCst);
    capture
        .requests
        .lock()
        .map_err(|_| "El estado del micrófono no está disponible.")?
        .send(AudioRequest::Start(app.clone(), generation, tx))
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || wait_for_audio(rx))
        .await
        .map_err(|e| e.to_string())?
}

fn request_audio_stop(
    capture: &AudioCaptureState,
    shutdown: bool,
) -> Result<std::sync::mpsc::Receiver<Result<String, String>>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    if shutdown {
        capture.shutting_down.store(true, Ordering::SeqCst);
    }
    capture.generation.fetch_add(1, Ordering::SeqCst);
    capture
        .requests
        .lock()
        .map_err(|_| "El estado del micrófono no está disponible.")?
        .send(if shutdown {
            AudioRequest::Shutdown(tx)
        } else {
            AudioRequest::Stop(tx)
        })
        .map_err(|e| e.to_string())?;
    Ok(rx)
}

fn wait_for_audio(rx: std::sync::mpsc::Receiver<Result<String, String>>) -> Result<String, String> {
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("No se recibió confirmación del hilo de audio: {e}"))?
}

#[tauri::command]
async fn stop_voice_capture(app: AppHandle) -> Result<String, String> {
    let rx = request_audio_stop(&app.state::<AudioCaptureState>(), false)?;
    tauri::async_runtime::spawn_blocking(move || wait_for_audio(rx))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn start_voice_sample_recording(app: AppHandle) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.state::<SampleAudioState>().requests.lock().map_err(|_| "El estado de grabación no está disponible.")?.send(SampleAudioRequest::Start(tx)).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|error| error.to_string())?).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn stop_voice_sample_recording(app: AppHandle) -> Result<Vec<i16>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.state::<SampleAudioState>().requests.lock().map_err(|_| "El estado de grabación no está disponible.")?.send(SampleAudioRequest::Stop(tx)).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|error| error.to_string())?).await.map_err(|error| error.to_string())?
}

// Event-loop callbacks must never wait for CPAL: device callbacks or teardown
// can themselves need platform dispatch. Queue first, then wait on a worker.
fn stop_for_desktop(app: &AppHandle, exit: bool) {
    if exit
        && app
            .state::<AudioCaptureState>()
            .shutting_down
            .load(Ordering::SeqCst)
    {
        return;
    }
    app.state::<DesktopState>()
        .pending_stops
        .fetch_add(1, Ordering::SeqCst);
    let rx = request_audio_stop(&app.state::<AudioCaptureState>(), exit);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = rx.and_then(wait_for_audio) {
            eprintln!("{e}");
        }
        desktop::release_shortcut(&app);
        app.state::<DesktopState>()
            .pending_stops
            .fetch_sub(1, Ordering::SeqCst);
        if exit {
            app.exit(0);
        }
    });
}

#[tauri::command]
fn switch_active_character(character_id: i32) -> Result<String, String> {
    Ok(format!(
        "Solicitud de personaje recibida: {character_id}; la sesión de voz debe aplicar el cambio."
    ))
}

#[cfg(target_os = "windows")]
fn media_key(code: u16) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    };
    let key = |flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [key(0), key(KEYEVENTF_KEYUP)];
    unsafe {
        if SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        ) != inputs.len() as u32
        {
            return Err(format!(
                "Windows no aceptó la entrada multimedia: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}

#[tauri::command]
async fn execute_pc_command(
    app: AppHandle,
    action: String,
    target: String,
    step: Option<u32>,
    confirmed: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_pc_command_native(app, &action, &target, step, confirmed)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn execute_pc_command_native(
    app_handle: AppHandle,
    action: &str,
    target: &str,
    step: Option<u32>,
    confirmed: Option<bool>,
) -> Result<String, String> {
    if !app_handle
        .state::<DesktopState>()
        .pc_control_enabled
        .load(Ordering::SeqCst)
    {
        return Err("El control de PC está deshabilitado.".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (action, target, step, confirmed);
        return Err("Los comandos de PC están disponibles en Windows.".into());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let app = match target {
            "spotify" => Some("Spotify.exe"),
            "chrome" | "navegador" => Some("chrome.exe"),
            "discord" => Some("Discord.exe"),
            "steam" => Some("steam.exe"),
            "terminal" => Some("wt.exe"),
            "vscode" => Some("Code.exe"),
            "blender" => Some("blender.exe"),
            "obs" => Some("obs64.exe"),
            "calculator" | "calculadora" => Some("calc.exe"),
            _ => None,
        };

        if matches!(action, "open_app" | "close_app") {
            app.ok_or("Aplicación no permitida")?;
            if confirmed != Some(true) {
                return Err("Se requiere confirmed: true para abrir o cerrar aplicaciones.".into());
            }
        }

        match action {
            "open_app" => {
                let program = app.ok_or("Aplicación no permitida")?;
                Command::new(program)
                    .spawn()
                    .map_err(|e| format!("No pude abrir {target}: {e}"))?;
                Ok(format!(
                    "Solicitud de inicio enviada a {target}; no se verificó su ventana."
                ))
            }
            "close_app" => {
                let program = app.ok_or("Aplicación no permitida")?;
                let taskkill = std::env::var_os("SystemRoot").ok_or("SystemRoot no disponible")?;
                let output =
                    Command::new(std::path::PathBuf::from(taskkill).join("System32/taskkill.exe"))
                        .args(["/IM", program])
                        .creation_flags(0x08000000)
                        .output()
                        .map_err(|e| format!("No pude cerrar {target}: {e}"))?;
                if output.status.success() {
                    Ok(format!(
                        "Windows aceptó la solicitud de cierre de {target}."
                    ))
                } else {
                    Err(format!(
                        "No pude cerrar {target}: {} {}",
                        String::from_utf8_lossy(&output.stdout).trim(),
                        String::from_utf8_lossy(&output.stderr).trim()
                    ))
                }
            }
            "volume_control" => {
                let key = match target {
                    "up" => 0xAF,
                    "down" => 0xAE,
                    "mute" => 0xAD,
                    _ => return Err("Acción de volumen no permitida".into()),
                };
                let times = if target == "mute" {
                    1
                } else {
                    (step.unwrap_or(10) / 2).clamp(1, 20)
                };
                for _ in 0..times {
                    media_key(key)?;
                }
                Ok(format!(
                    "Entrada de volumen enviada: {target}; no se verificó el volumen final."
                ))
            }
            "media_control" => {
                let key = match target {
                    "play_pause" => 0xB3,
                    "next_track" => 0xB0,
                    _ => return Err("Control multimedia no permitido".into()),
                };
                media_key(key)?;
                Ok(format!(
                    "Entrada multimedia enviada: {target}; no se verificó la reproducción."
                ))
            }
            _ => Err("Comando no permitido".into()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AudioCaptureState::default())
        .manage(SampleAudioState::default())
        .manage(generated_audio::GeneratedAudioState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| desktop::setup(app.handle()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let background = app
                    .state::<DesktopState>()
                    .preferences
                    .lock()
                    .map(|p| p.background_enabled)
                    .unwrap_or(false);
                if background {
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        eprintln!("No se pudo ocultar la ventana: {e}");
                    }
                } else {
                    api.prevent_close();
                    stop_for_desktop(app, true);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            desktop_auth::google_desktop_login,
            start_voice_capture,
            stop_voice_capture,
            start_voice_sample_recording,
            stop_voice_sample_recording,
            switch_active_character,
            execute_pc_command,
            desktop::get_desktop_settings,
            desktop::set_background_enabled,
            desktop::set_voice_shortcut,
            desktop::set_shortcut_recording,
            desktop::set_pc_control_enabled,
            generated_audio::start_generated_audio_archive,
            generated_audio::append_generated_audio_archive,
            generated_audio::finish_generated_audio_archive,
            generated_audio::read_generated_audio_archive,
            generated_audio::export_generated_audio_archive,
            generated_audio::delete_generated_audio_archive,
            generated_audio::discard_generated_audio_archive
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app
                    .state::<AudioCaptureState>()
                    .shutting_down
                    .load(Ordering::SeqCst)
                {
                    api.prevent_exit();
                    stop_for_desktop(app, true);
                }
            }
        });
}
