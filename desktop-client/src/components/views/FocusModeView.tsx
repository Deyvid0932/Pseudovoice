import { useEffect, useRef, useState } from "react";
import type { VoiceProfile } from "../../types/voice";
import type { UseActiveSessionResult } from "../../hooks/useActiveSession";
import { cn } from "../../lib/format";
import { createAvatarDataUrl } from "../../lib/avatarImage";
import { Avatar } from "../ui/Avatar";
import { CharacterStage } from "../focus/CharacterStage";
import { TranscriptPanel } from "../focus/TranscriptPanel";
import { VoiceOrb } from "../focus/VoiceOrb";
import {
  ClockIcon,
  GearIcon,
  PowerIcon,
  RadioIcon,
  SearchIcon,
  PlusIcon,
} from "../ui/icons";

export interface FocusModeViewProps {
  profiles: VoiceProfile[];
  profilesLoading: boolean;
  activeProfile: VoiceProfile | null;
  onAddCharacter: (name: string, voiceFile: File, avatarUrl?: string) => Promise<void>;
  session: UseActiveSessionResult;
  onSelectCharacter: (profile: VoiceProfile) => void;
  onOpenLogs: () => void;
}

export function FocusModeView({
  profiles,
  profilesLoading,
  activeProfile,
  onAddCharacter,
  session,
  onSelectCharacter,
  onOpenLogs,
}: FocusModeViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createVoiceOpen, setCreateVoiceOpen] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const average =
    session.levels.length > 0
      ? session.levels.reduce((sum, value) => sum + value, 0) /
        session.levels.length
      : 0;

  const connected = session.engineState !== "OFFLINE";
  const connectionLabel = session.engineState === "OK" ? "Connected" : connected ? "Degraded" : "Offline";

  return (
    <section
      aria-label="Focus mode"
      className="relative flex h-full w-full flex-1 min-h-0 flex-col overflow-hidden"
    >
      <CharacterStage profile={activeProfile} />

      <div className="relative z-10 flex h-full w-full flex-1 min-h-0 flex-col justify-between px-6 sm:px-8 py-5">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <p className="pv-kicker text-zinc-500">
              <span className="text-zinc-600">01</span>
              <span className="px-1.5 text-zinc-700">/</span>
              <span className="text-teal-400">Live Session</span>
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3.5 py-2 backdrop-blur">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  session.engineState === "OK"
                    ? "animate-pv-pulse bg-emerald-400"
                    : connected ? "bg-amber-400" : "bg-zinc-500",
                )}
              />
              <span
                className={cn(
                  "pv-kicker",
                  session.engineState === "OK" ? "text-emerald-300" : connected ? "text-amber-300" : "text-zinc-400",
                )}
              >
                {connectionLabel}
              </span>
            </span>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="pv-kicker text-zinc-500">
              PTAP: <span className="text-zinc-300">{session.latencyMs} ms</span>
            </span>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="pv-kicker text-zinc-500">
              Switcher <span className="text-zinc-300">System 1</span>
            </span>
          </div>
        </div>

        {/* Central audio stage: perfectly centered vertically and horizontally */}
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 min-h-0 flex-col items-center justify-center gap-4 py-2">
          {activeProfile ? (
            <>
              <VoiceOrb
                status={session.status}
                levels={session.levels}
                pressed={session.isLive}
                onToggle={() => void session.toggleMic()}
                onPulse={session.pulse}
                characterName={activeProfile.name}
              />
              <p className="z-10 text-sm font-semibold tracking-[0.42em] text-zinc-200 drop-shadow-[0_0_12px_rgba(45,212,191,0.35)]">
                {session.statusLabel}
              </p>
              <div className="z-10 mt-2 w-full max-w-xl">
                <TranscriptPanel lines={session.transcript} speaking={session.status === "speaking"} level={average} />
              </div>
            </>
          ) : (
            <div className="z-10 flex max-w-md flex-col items-center text-center">
              <span className="flex h-24 w-24 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-950/80 text-3xl font-semibold text-teal-300 shadow-[0_0_45px_rgba(45,212,191,0.12)]">
                J
              </span>
              <h2 className="mt-6 text-lg font-semibold text-zinc-100">
                {profilesLoading ? "Cargando personajes…" : "Todavía no hay personajes"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {profilesLoading ? "Consultando tus personajes guardados." : "Crea uno para configurar su voz y conversar con Jev."}
              </p>
              {!profilesLoading && (
                <button
                  type="button"
                  onClick={() => setCreateVoiceOpen(true)}
                  className="mt-5 flex items-center gap-2 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2.5 text-sm font-medium text-teal-200 transition hover:border-teal-400/70 hover:bg-teal-500/15"
                >
                  <PlusIcon size={16} /> Crear personaje
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4">
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => !profilesLoading && setPickerOpen((open) => !open)}
              disabled={profilesLoading}
              aria-expanded={pickerOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-zinc-300 backdrop-blur transition-all duration-200 hover:border-teal-500/40 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PowerIcon size={15} />
              <span className="pv-kicker">Cambiar personaje</span>
            </button>

            {pickerOpen ? (
              <div
                role="menu"
                className="animate-pv-rise absolute bottom-14 left-0 z-20 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur"
              >
                {profiles.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-zinc-500">Todavía no tienes voces configuradas.</p>
                ) : null}
                {profiles.map((profile) => {
                  const isActive = profile.id === activeProfile?.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        onSelectCharacter(profile);
                        setPickerOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
                        isActive
                          ? "bg-teal-500/15"
                          : "hover:bg-zinc-800/70",
                      )}
                    >
                      <Avatar
                        seed={profile.avatarSeed}
                        label={profile.name}
                        palette={profile.palette}
                        size={30}
                        status={isActive ? "online" : "offline"}
                        imageUrl={profile.avatarUrl}
                        decorative
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-100">
                          {profile.name}
                        </span>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {profile.archetype}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setPickerOpen(false); setCreateVoiceOpen(true); }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-zinc-800 px-3 py-2.5 text-left text-xs font-medium text-teal-300 hover:bg-zinc-800/70"
                >
                  <PlusIcon size={14} /> Añadir voz de referencia
                </button>
              </div>
            ) : null}
          </div>

          {/* Center utility dock matching Image 2 */}
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/70 p-1 backdrop-blur shadow-lg shadow-black/60">
            <button
              type="button"
              aria-label="Frecuencia de audio"
              className="rounded-full p-2 text-zinc-500 hover:text-teal-300 hover:bg-zinc-900 transition-colors"
            >
              <RadioIcon size={14} />
            </button>
            <button
              type="button"
              aria-label="Buscar en la sesión"
              className="rounded-full p-2 text-zinc-500 hover:text-teal-300 hover:bg-zinc-900 transition-colors"
            >
              <SearchIcon size={14} />
            </button>
            <button
              type="button"
              aria-label="Ajustes de audio"
              className="rounded-full p-2 text-zinc-500 hover:text-teal-300 hover:bg-zinc-900 transition-colors"
            >
              <GearIcon size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenLogs}
            className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-zinc-300 backdrop-blur transition-all duration-200 hover:border-teal-500/40 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-[0.99]"
          >
            <ClockIcon size={15} />
            <span className="pv-kicker">Open session logs</span>
          </button>
        </div>
      </div>

      {createVoiceOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !savingVoice && !processingAvatar) setCreateVoiceOpen(false); }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!voiceFile) { setCreateError("Selecciona una muestra WAV de tu voz."); return; }
              setSavingVoice(true);
              setCreateError(null);
              try {
                await onAddCharacter(newCharacterName, voiceFile, avatarUrl ?? undefined);
                setCreateVoiceOpen(false);
                setNewCharacterName("");
                setVoiceFile(null);
                setAvatarUrl(null);
              } catch (error) {
                setCreateError(error instanceof Error ? error.message : String(error));
              } finally {
                setSavingVoice(false);
              }
            }}
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
          >
            <p className="pv-kicker text-teal-400">VOICE SETUP</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-100">Añadir voz de referencia</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">La muestra se usará para crear una voz personalizada y generar respuestas. Usa una voz propia o una voz para la que tengas permiso.</p>
            <label className="mt-5 block text-xs font-medium text-zinc-300">
              Nombre
              <input
                autoFocus
                required
                maxLength={100}
                value={newCharacterName}
                onChange={(event) => setNewCharacterName(event.target.value)}
                placeholder="Mi voz"
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-teal-500"
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-zinc-300">
              Foto del personaje (opcional; cuadrada, máximo 256 KB tras comprimir)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  setAvatarUrl(null);
                  if (!file) return;
                  setProcessingAvatar(true);
                  try {
                    setAvatarUrl(await createAvatarDataUrl(file));
                    setCreateError(null);
                  } catch (error) {
                    setCreateError(error instanceof Error ? error.message : String(error));
                    event.target.value = "";
                  } finally {
                    setProcessingAvatar(false);
                  }
                }}
                className="mt-1.5 block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:text-zinc-200"
              />
            </label>
            {avatarUrl ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                <Avatar seed={newCharacterName || "new-character"} label="Vista previa del personaje" imageUrl={avatarUrl} size={36} roundedClassName="rounded-full" />
                Foto lista para guardar
              </div>
            ) : null}
            <label className="mt-4 block text-xs font-medium text-zinc-300">
              Muestra de audio (WAV, máximo 20 MB; idealmente 6–15 segundos limpios)
              <input
                required
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                onChange={(event) => setVoiceFile(event.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:text-zinc-200"
              />
            </label>
            {voiceFile ? <p className="mt-2 truncate text-xs text-zinc-500">{voiceFile.name}</p> : null}
            {createError ? <p role="alert" className="mt-3 text-xs text-rose-300">{createError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={savingVoice || processingAvatar} onClick={() => setCreateVoiceOpen(false)} className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900">Cancelar</button>
              <button type="submit" disabled={savingVoice || processingAvatar || !newCharacterName.trim() || !voiceFile} className="rounded-lg bg-teal-500/15 px-4 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 disabled:opacity-40">
                {savingVoice ? "Subiendo y guardando…" : processingAvatar ? "Procesando foto…" : "Guardar voz"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
