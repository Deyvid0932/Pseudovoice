use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub background_enabled: bool,
    pub voice_shortcut: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            background_enabled: false,
            voice_shortcut: "Ctrl+Alt+Space".into(),
        }
    }
}

pub struct DesktopState {
    pub preferences: Mutex<Preferences>,
    pub pc_control_enabled: AtomicBool,
    pub paused: AtomicBool,
    pub pending_stops: AtomicUsize,
    shortcut_registered: AtomicBool,
    shortcut_error: Mutex<Option<String>>,
    shortcut_pressed: AtomicBool,
    shortcut_recording: AtomicBool,
    shortcut_update: Mutex<()>,
    path: PathBuf,
}

impl DesktopState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let path = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("preferences.json");
        let preferences = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|e| {
                eprintln!("Preferencias inválidas: {e}");
                Preferences::default()
            }),
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    eprintln!("No se pudieron leer preferencias: {e}");
                }
                Preferences::default()
            }
        };
        Ok(Self {
            preferences: Mutex::new(preferences),
            path,
            pc_control_enabled: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            pending_stops: AtomicUsize::new(0),
            shortcut_registered: AtomicBool::new(false),
            shortcut_error: Mutex::new(None),
            shortcut_pressed: AtomicBool::new(false),
            shortcut_recording: AtomicBool::new(false),
            shortcut_update: Mutex::new(()),
        })
    }

    fn save(&self, preferences: &Preferences) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(preferences).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(self.path.parent().ok_or("Ruta de preferencias inválida")?)
            .map_err(|e| e.to_string())?;
        std::fs::write(&self.path, bytes)
            .map_err(|e| format!("No se pudieron guardar preferencias: {e}"))
    }
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    pressed: bool,
}

pub fn release_shortcut(app: &AppHandle) {
    app.state::<DesktopState>()
        .shortcut_pressed
        .store(false, Ordering::SeqCst);
    if let Err(e) = app.emit("voice-shortcut", ShortcutPayload { pressed: false }) {
        eprintln!("{e}");
    }
}

fn register_shortcut(app: &AppHandle, shortcut: Shortcut) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _, event| {
            let state = app.state::<DesktopState>();
            if state.shortcut_recording.load(Ordering::SeqCst) {
                return;
            }
            let pressed = event.state == ShortcutState::Pressed;
            if pressed
                && (state.paused.load(Ordering::SeqCst)
                    || state.pending_stops.load(Ordering::SeqCst) > 0
                    || app
                        .state::<super::AudioCaptureState>()
                        .shutting_down
                        .load(Ordering::SeqCst))
            {
                return;
            }
            if state.shortcut_pressed.swap(pressed, Ordering::SeqCst) == pressed {
                return;
            }
            if !pressed {
                super::stop_for_desktop(app, false);
                return;
            }
            if let Err(e) = app.emit("voice-shortcut", ShortcutPayload { pressed }) {
                eprintln!("{e}");
            }
        })
        .map_err(|e| format!("No se pudo registrar el atajo: {e}"))
}

#[tauri::command]
pub fn get_desktop_settings(state: State<'_, DesktopState>) -> Result<serde_json::Value, String> {
    let prefs = state
        .preferences
        .lock()
        .map_err(|_| "Preferencias no disponibles")?;
    Ok(serde_json::json!({
        "background_enabled": prefs.background_enabled, "voice_shortcut": prefs.voice_shortcut,
        "pc_control_enabled": state.pc_control_enabled.load(Ordering::SeqCst),
        "paused": state.paused.load(Ordering::SeqCst),
        "shortcut_registered": state.shortcut_registered.load(Ordering::SeqCst),
        "shortcut_error": *state.shortcut_error.lock().map_err(|_| "Estado del atajo no disponible")?
    }))
}

#[tauri::command]
pub fn set_background_enabled(enabled: bool, state: State<'_, DesktopState>) -> Result<(), String> {
    let mut prefs = state
        .preferences
        .lock()
        .map_err(|_| "Preferencias no disponibles")?;
    let mut next = prefs.clone();
    next.background_enabled = enabled;
    state.save(&next)?;
    *prefs = next;
    Ok(())
}

// Run off the event loop: the shortcut plugin dispatches registration to the main thread.
#[tauri::command]
pub async fn set_voice_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let new: Shortcut = shortcut
            .parse()
            .map_err(|e| format!("Atajo inválido: {e}"))?;
        let state = app.state::<DesktopState>();
        let _update = state
            .shortcut_update
            .lock()
            .map_err(|_| "Estado del atajo no disponible")?;
        // Never hold preferences across calls that dispatch to the main thread:
        // window-close callbacks on that thread also read preferences.
        let old: Shortcut = state
            .preferences
            .lock()
            .map_err(|_| "Preferencias no disponibles")?
            .voice_shortcut
            .parse()
            .map_err(|e| format!("Atajo anterior inválido: {e}"))?;
        let was_registered = state.shortcut_registered.load(Ordering::SeqCst);
        if new == old && was_registered {
            return Ok(());
        }
        register_shortcut(&app, new)?;
        if was_registered {
            if let Err(e) = app.global_shortcut().unregister(old) {
                let _ = app.global_shortcut().unregister(new);
                return Err(e.to_string());
            }
        }
        let saved = (|| -> Result<(), String> {
            let mut prefs = state
                .preferences
                .lock()
                .map_err(|_| "Preferencias no disponibles")?;
            let mut next = prefs.clone();
            next.voice_shortcut = shortcut;
            state.save(&next)?;
            *prefs = next;
            Ok(())
        })();
        if let Err(e) = saved {
            let _ = app.global_shortcut().unregister(new);
            if was_registered {
                if let Err(rollback) = register_shortcut(&app, old) {
                    state.shortcut_registered.store(false, Ordering::SeqCst);
                    *state
                        .shortcut_error
                        .lock()
                        .map_err(|_| "Estado del atajo no disponible")? = Some(rollback.clone());
                    eprintln!("{rollback}");
                }
            }
            return Err(e);
        }
        state.shortcut_registered.store(true, Ordering::SeqCst);
        *state
            .shortcut_error
            .lock()
            .map_err(|_| "Estado del atajo no disponible")? = None;
        super::stop_for_desktop(&app, false);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn set_pc_control_enabled(enabled: bool, state: State<'_, DesktopState>) {
    state.pc_control_enabled.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
pub async fn set_shortcut_recording(app: AppHandle, recording: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopState>();
        let _update = state.shortcut_update.lock().map_err(|_| "Estado del atajo no disponible")?;
        if state.shortcut_recording.load(Ordering::SeqCst) == recording {
            return Ok(());
        }
        let shortcut: Shortcut = state.preferences.lock()
            .map_err(|_| "Preferencias no disponibles")?.voice_shortcut.parse()
            .map_err(|error| format!("Atajo inválido: {error}"))?;
        if recording {
            if state.shortcut_registered.load(Ordering::SeqCst) {
                app.global_shortcut().unregister(shortcut).map_err(|error| error.to_string())?;
                state.shortcut_registered.store(false, Ordering::SeqCst);
            }
            state.shortcut_recording.store(true, Ordering::SeqCst);
            super::stop_for_desktop(&app, false);
        } else {
            if !state.shortcut_registered.load(Ordering::SeqCst) {
                if let Err(error) = register_shortcut(&app, shortcut) {
                    *state.shortcut_error.lock().map_err(|_| "Estado del atajo no disponible")? = Some(error.clone());
                    return Err(error);
                }
                state.shortcut_registered.store(true, Ordering::SeqCst);
                *state.shortcut_error.lock().map_err(|_| "Estado del atajo no disponible")? = None;
            }
            state.shortcut_recording.store(false, Ordering::SeqCst);
        }
        Ok(())
    }).await.map_err(|error| error.to_string())?
}

fn show(app: &AppHandle) {
    super::stop_for_desktop(app, false);
    if let Some(window) = app.get_webview_window("main") {
        for result in [window.show(), window.unminimize(), window.set_focus()] {
            if let Err(e) = result {
                eprintln!("No se pudo mostrar la ventana: {e}");
            }
        }
    }
}

pub fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let state = DesktopState::load(app)?;
    let shortcut = state
        .preferences
        .lock()
        .map_err(|_| "Preferencias no disponibles")?
        .voice_shortcut
        .clone();
    app.manage(state);
    if let Err(e) = shortcut
        .parse::<Shortcut>()
        .map_err(|e| e.to_string())
        .and_then(|s| register_shortcut(app, s))
    {
        eprintln!("{e}");
        let fallback = Preferences::default();
        let state = app.state::<DesktopState>();
        let fallback_result = if shortcut != fallback.voice_shortcut {
            register_shortcut(app, fallback.voice_shortcut.parse::<Shortcut>()?)
        } else {
            Err(e)
        };
        match fallback_result {
            Ok(()) => {
                state.shortcut_registered.store(true, Ordering::SeqCst);
                state
                    .preferences
                    .lock()
                    .map_err(|_| "Preferencias no disponibles")?
                    .voice_shortcut = fallback.voice_shortcut;
            }
            Err(error) => {
                eprintln!("Atajo no disponible; la app seguirá abierta: {error}");
                *state
                    .shortcut_error
                    .lock()
                    .map_err(|_| "Estado del atajo no disponible")? = Some(error);
            }
        }
    } else {
        app.state::<DesktopState>()
            .shortcut_registered
            .store(true, Ordering::SeqCst);
    }
    let show_item = MenuItem::with_id(app, "show", "Mostrar PseudoVoice", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "Pausar / reanudar voz", true, None::<&str>)?;
    let exit_item = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &pause_item, &exit_item])?;
    let mut tray = TrayIconBuilder::with_id("pseudovoice")
        .tooltip("PseudoVoice")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show(app),
            "pause" => {
                let state = app.state::<DesktopState>();
                let paused = !state.paused.fetch_xor(true, Ordering::SeqCst);
                super::stop_for_desktop(app, false);
                if let Err(e) = app.emit("voice-paused", serde_json::json!({"paused": paused})) {
                    eprintln!("{e}");
                }
            }
            "exit" => {
                super::stop_for_desktop(app, true);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
