import { invoke } from "@tauri-apps/api/core";

/**
 * Puente seguro de comunicación IPC con el backend nativo de Rust (Tauri v2).
 * Satisface las directivas de la skill desktop-client:
 * - start_voice_capture()
 * - stop_voice_capture()
 * - switch_active_character(character_id: i32)
 */

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export const tauriBridge = {
  isTauri: isTauriEnvironment,
  async getDesktopSettings(): Promise<{ background_enabled: boolean; voice_shortcut: string; pc_control_enabled: boolean; paused: boolean }> {
    return invoke("get_desktop_settings");
  },
  async googleDesktopLogin(clientId: string): Promise<{ authorizationCode: string; codeVerifier: string; redirectUri: string }> {
    if (!isTauriEnvironment()) throw new Error("El acceso de escritorio requiere Tauri.");
    return invoke("google_desktop_login", { clientId });
  },
  async setVoiceShortcut(shortcut: string): Promise<void> {
    if (!isTauriEnvironment()) throw new Error("Disponible en la aplicación de escritorio.");
    await invoke("set_voice_shortcut", { shortcut });
  },
  async setShortcutRecording(recording: boolean): Promise<void> {
    if (!isTauriEnvironment()) return;
    await invoke("set_shortcut_recording", { recording });
  },
  async exportGeneratedAudioArchive(turnId: string): Promise<string | null> {
    if (!isTauriEnvironment()) throw new Error("Guardar como requiere la aplicación de escritorio.");
    return invoke("export_generated_audio_archive", { turnId });
  },

  async executePcCommand(command: {
    action: string;
    target: string;
    parameters?: { step?: number };
  }, confirmed: boolean): Promise<string> {
    if (!isTauriEnvironment()) {
      throw new Error("Los comandos del sistema requieren la aplicación de escritorio.");
    }
    return invoke<string>("execute_pc_command", {
      action: command.action,
      target: command.target,
      step: command.parameters?.step,
      confirmed,
    });
  },

  async setBackgroundEnabled(enabled: boolean): Promise<void> {
    if (!isTauriEnvironment()) throw new Error("Disponible en la aplicación de escritorio.");
    await invoke("set_background_enabled", { enabled });
  },
  async setPcControlEnabled(enabled: boolean): Promise<void> {
    if (!isTauriEnvironment()) throw new Error("Disponible en la aplicación de escritorio.");
    await invoke("set_pc_control_enabled", { enabled });
  },

  async startGeneratedAudioArchive(turnId: string): Promise<void> {
    if (!isTauriEnvironment()) throw new Error("El guardado de audio requiere la app de escritorio.");
    await invoke("start_generated_audio_archive", { turnId });
  },
  async appendGeneratedAudioArchive(turnId: string, chunk: Uint8Array): Promise<void> {
    if (!isTauriEnvironment()) throw new Error("El guardado de audio requiere la app de escritorio.");
    await invoke("append_generated_audio_archive", { turnId, chunk: Array.from(chunk) });
  },
  async finishGeneratedAudioArchive(turnId: string): Promise<boolean> {
    if (!isTauriEnvironment()) throw new Error("El guardado de audio requiere la app de escritorio.");
    return invoke<boolean>("finish_generated_audio_archive", { turnId });
  },
  async readGeneratedAudioArchive(turnId: string): Promise<Uint8Array> {
    if (!isTauriEnvironment()) throw new Error("El audio guardado solo se puede reproducir en la app de escritorio.");
    const bytes = await invoke<number[]>("read_generated_audio_archive", { turnId });
    return Uint8Array.from(bytes);
  },
  async deleteGeneratedAudioArchive(turnId: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    await invoke("delete_generated_audio_archive", { turnId });
  },
  async discardGeneratedAudioArchive(turnId: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    await invoke("discard_generated_audio_archive", { turnId });
  },

  async startVoiceCapture(): Promise<string> {
    if (!isTauriEnvironment()) {
      console.info("[TauriBridge] Browser dev mode: start_voice_capture stubbed");
      return "Browser stub";
    }
    return invoke<string>("start_voice_capture");
  },

  async stopVoiceCapture(): Promise<string> {
    if (!isTauriEnvironment()) {
      console.info("[TauriBridge] Browser dev mode: stop_voice_capture stubbed");
      return "Browser stub";
    }
    return invoke<string>("stop_voice_capture");
  },

  async startVoiceSampleRecording(): Promise<string> {
    if (!isTauriEnvironment()) throw new Error("La grabación de muestras requiere la aplicación de escritorio.");
    return invoke<string>("start_voice_sample_recording");
  },

  async stopVoiceSampleRecording(): Promise<Int16Array> {
    if (!isTauriEnvironment()) throw new Error("La grabación de muestras requiere la aplicación de escritorio.");
    const samples = await invoke<number[]>("stop_voice_sample_recording");
    return Int16Array.from(samples);
  },

  async switchActiveCharacter(characterId: number): Promise<string> {
    if (!isTauriEnvironment()) {
      console.info(
        `[TauriBridge] Browser dev mode: switch_active_character(${characterId}) stubbed`,
      );
      return `Browser stub (${characterId})`;
    }
    try {
      return await invoke<string>("switch_active_character", {
        characterId,
      });
    } catch (err) {
      console.warn(
        `[TauriBridge] Error invoking switch_active_character(${characterId}):`,
        err,
      );
      return String(err);
    }
  },
};
