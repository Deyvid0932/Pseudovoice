use std::{
    fs::{self, File},
    io::{Seek, SeekFrom, Write},
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const MAX_AUDIO_BYTES: u64 = 64 * 1024 * 1024;

struct ActiveArchive {
    turn_id: String,
    file: File,
    temporary_path: PathBuf,
    final_path: PathBuf,
    data_bytes: u64,
}

#[derive(Default)]
pub struct GeneratedAudioState(Mutex<Option<ActiveArchive>>);

fn valid_turn_id(turn_id: &str) -> bool {
    !turn_id.is_empty()
        && turn_id.len() <= 64
        && turn_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn archive_paths(app: &AppHandle, turn_id: &str) -> Result<(PathBuf, PathBuf), String> {
    if !valid_turn_id(turn_id) {
        return Err("Identificador de audio no válido.".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("generated-audio");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("No se pudo preparar la carpeta de audio local: {error}"))?;
    Ok((
        directory.join(format!("{turn_id}.wav.part")),
        directory.join(format!("{turn_id}.wav")),
    ))
}

#[tauri::command]
pub fn start_generated_audio_archive(
    app: AppHandle,
    state: State<'_, GeneratedAudioState>,
    turn_id: String,
) -> Result<(), String> {
    let (temporary_path, final_path) = archive_paths(&app, &turn_id)?;
    let mut file = File::create(&temporary_path)
        .map_err(|error| format!("No se pudo iniciar el guardado local del audio: {error}"))?;
    file.write_all(&[0u8; 44])
        .map_err(|error| format!("No se pudo preparar el WAV local: {error}"))?;
    let mut active = state
        .0
        .lock()
        .map_err(|_| "El guardado local de audio no está disponible.")?;
    if let Some(previous) = active.take() {
        let _ = fs::remove_file(previous.temporary_path);
    }
    *active = Some(ActiveArchive {
        turn_id,
        file,
        temporary_path,
        final_path,
        data_bytes: 0,
    });
    Ok(())
}

#[tauri::command]
pub fn append_generated_audio_archive(
    state: State<'_, GeneratedAudioState>,
    turn_id: String,
    chunk: Vec<u8>,
) -> Result<(), String> {
    let mut active = state
        .0
        .lock()
        .map_err(|_| "El guardado local de audio no está disponible.")?;
    let archive = active
        .as_mut()
        .filter(|archive| archive.turn_id == turn_id)
        .ok_or("No hay un archivo de audio activo para esta respuesta.")?;
    if archive.data_bytes.saturating_add(chunk.len() as u64) > MAX_AUDIO_BYTES {
        return Err("La respuesta de audio excedió el límite local de 64 MiB.".into());
    }
    archive
        .file
        .write_all(&chunk)
        .map_err(|error| format!("No se pudo escribir el audio local: {error}"))?;
    archive.data_bytes += chunk.len() as u64;
    Ok(())
}

#[tauri::command]
pub fn finish_generated_audio_archive(
    state: State<'_, GeneratedAudioState>,
    turn_id: String,
) -> Result<bool, String> {
    let mut active = state
        .0
        .lock()
        .map_err(|_| "El guardado local de audio no está disponible.")?;
    let archive = active
        .as_ref()
        .filter(|archive| archive.turn_id == turn_id)
        .ok_or("No hay un archivo de audio activo para finalizar.")?;
    if archive.data_bytes == 0 {
        let archive = active.take().expect("archive checked above");
        let _ = fs::remove_file(archive.temporary_path);
        return Ok(false);
    }
    let mut archive = active.take().expect("archive checked above");
    let data_bytes = archive.data_bytes as u32;
    archive
        .file
        .seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(b"RIFF")
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&(data_bytes + 36).to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(b"WAVEfmt ")
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&16u32.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&1u16.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&1u16.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&24_000u32.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&48_000u32.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&2u16.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&16u16.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(b"data")
        .map_err(|error| error.to_string())?;
    archive
        .file
        .write_all(&data_bytes.to_le_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .file
        .sync_all()
        .map_err(|error| format!("No se pudo finalizar el WAV local: {error}"))?;
    drop(archive.file);
    fs::rename(&archive.temporary_path, &archive.final_path)
        .map_err(|error| format!("No se pudo publicar el WAV local: {error}"))?;
    Ok(true)
}

#[tauri::command]
pub fn read_generated_audio_archive(app: AppHandle, turn_id: String) -> Result<Vec<u8>, String> {
    let (_, path) = archive_paths(&app, &turn_id)?;
    fs::read(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => "El audio no está guardado en este dispositivo.".into(),
        _ => format!("No se pudo leer el audio guardado: {error}"),
    })
}

#[cfg(windows)]
#[tauri::command]
pub async fn export_generated_audio_archive(app: AppHandle, turn_id: String) -> Result<Option<String>, String> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::UI::Controls::Dialogs::{
        CommDlgExtendedError, GetSaveFileNameW, OPENFILENAMEW,
        OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST,
    };

    let (_, source) = archive_paths(&app, &turn_id)?;
    if !source.is_file() {
        return Err("El audio no está guardado en este dispositivo.".into());
    }
    let owner = app.get_webview_window("main")
        .and_then(|window| window.hwnd().ok())
        .map(|handle| handle.0 as usize)
        .unwrap_or(0);
    let downloads = app.path().download_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let mut filename = vec![0u16; 32768];
        let suggested: Vec<u16> = format!("pseudovoice-{turn_id}.wav").encode_utf16().collect();
        filename[..suggested.len()].copy_from_slice(&suggested);
        let filter: Vec<u16> = "Audio WAV (*.wav)\0*.wav\0\0".encode_utf16().collect();
        let title: Vec<u16> = "Guardar voz como\0".encode_utf16().collect();
        let extension: Vec<u16> = "wav\0".encode_utf16().collect();
        let initial_directory = downloads.map(|path| path.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<u16>>());
        let mut dialog = OPENFILENAMEW {
            lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
            hwndOwner: owner as _,
            lpstrFilter: filter.as_ptr(),
            nFilterIndex: 1,
            lpstrFile: filename.as_mut_ptr(),
            nMaxFile: filename.len() as u32,
            lpstrInitialDir: initial_directory.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()),
            lpstrTitle: title.as_ptr(),
            lpstrDefExt: extension.as_ptr(),
            Flags: OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST,
            ..Default::default()
        };
        if unsafe { GetSaveFileNameW(&mut dialog) } == 0 {
            let error = unsafe { CommDlgExtendedError() };
            return if error == 0 { Ok(None) } else { Err(format!("No se pudo abrir Guardar como: {error}")) };
        }
        let length = filename.iter().position(|value| *value == 0).unwrap_or(filename.len());
        let destination = PathBuf::from(std::ffi::OsString::from_wide(&filename[..length]));
        if destination != source {
            fs::copy(&source, &destination).map_err(|error| format!("No se pudo guardar el audio: {error}"))?;
        }
        Ok(Some(destination.to_string_lossy().into_owned()))
    }).await.map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn export_generated_audio_archive(app: AppHandle, turn_id: String) -> Result<Option<String>, String> {
    let _ = (app, turn_id);
    Err("El diálogo Guardar como está disponible en Windows.".into())
}

#[tauri::command]
pub fn delete_generated_audio_archive(app: AppHandle, turn_id: String) -> Result<(), String> {
    let (temporary_path, final_path) = archive_paths(&app, &turn_id)?;
    for path in [temporary_path, final_path] {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("No se pudo eliminar el audio local: {error}")),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn discard_generated_audio_archive(
    state: State<'_, GeneratedAudioState>,
    app: AppHandle,
    turn_id: String,
) -> Result<(), String> {
    let mut active = state
        .0
        .lock()
        .map_err(|_| "El guardado local de audio no está disponible.")?;
    if active
        .as_ref()
        .is_some_and(|archive| archive.turn_id == turn_id)
    {
        let archive = active.take().expect("active archive checked above");
        drop(archive.file);
        let _ = fs::remove_file(archive.temporary_path);
    }
    let (temporary_path, _) = archive_paths(&app, &turn_id)?;
    match fs::remove_file(temporary_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("No se pudo limpiar el audio incompleto: {error}")),
    }
}
