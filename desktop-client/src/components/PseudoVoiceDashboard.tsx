import { useCallback, useEffect, useRef, useState } from "react";
import type { SuiteView, VoiceProfile } from "../types/voice";
import { useActiveSession } from "../hooks/useActiveSession";
import { useWakeActivation } from "../hooks/useWakeActivation";
import { useSessionConfigBridge } from "../hooks/useRuleGraph";
import { useToasts } from "../hooks/useToasts";
import { useVoiceProfiles } from "../hooks/useVoiceProfiles";
import { inferenceSocketService } from "../services/inferenceSocketService";
import { conversationService } from "../services/conversationService";
import { aiInferenceService } from "../services/aiInferenceService";
import { userService, type UserProfile } from "../services/userService";
import { ConversationView } from "./ConversationView";
import { tauriBridge } from "../services/tauriBridge";
import { readPreference, savePreference, type Theme } from "../lib/preferences";
import { AppSidebar } from "./AppSidebar";
import { HistoryTelemetryView } from "./views/HistoryTelemetryView";
import { SessionLogsDrawer } from "./telemetry/SessionLogsDrawer";
import { SettingsHub, type SettingsSection } from "./SettingsHub";
import { ToastViewport } from "./ui/Toast";
import type { AuthUser } from "../lib/authStorage";
import { localAudioId, useConversations } from "../hooks/useConversations";
import { Avatar } from "./ui/Avatar";
import { AgentTaskTray } from "./AgentTaskTray";
import { agentService, type AgentPreferences, type AgentTask } from "../services/agentService";
import { getCurrentWindow } from "@tauri-apps/api/window";

const BUILD = "2.0.4";

const SUITE_VIEWS: SuiteView[] = ["focus", "logs"];
type ResponseLength = "short" | "normal" | "long";

function resolveInitialView(): SuiteView {
  const requested = new URLSearchParams(window.location.search).get("view");
  return SUITE_VIEWS.find((item) => item === requested) ?? "focus";
}

export function PseudoVoiceDashboard({ user, onSignOut, theme, onThemeChange }: { user: AuthUser; onSignOut: () => void; theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const userId = user.userId;
  const [view, setView] = useState<SuiteView>(resolveInitialView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("desktop");
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationOpenError, setConversationOpenError] = useState<{ conversationId: number; message: string } | null>(null);
  const conversationRequestRef = useRef(0);
  const currentConversationIdRef = useRef<number | null>(conversationId);
  const suppressAutoCreateForRef = useRef<number | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [background, setBackground] = useState(false);
  const [shortcut, setShortcut] = useState("Ctrl+Alt+Space");
  const [wakeEnabled, setWakeEnabled] = useState(() => readPreference(`wake-enabled-${userId}`, "false") === "true");
  const [wakePhrase, setWakePhrase] = useState(() => readPreference(`wake-phrase-${userId}`, "Oye"));
  const [pcControlEnabled, setPcControlEnabled] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const closingAgentTasks = useRef(false);
  const [saveResponseAudio, setSaveResponseAudio] = useState(() => readPreference("save-response-audio", "false") === "true");
  const [responseLength, setResponseLength] = useState<ResponseLength>(() => {
    const saved = readPreference("response-length", "normal");
    return saved === "short" || saved === "long" ? saved : "normal";
  });
  useEffect(() => {
    if (!tauriBridge.isTauri()) return;
    void tauriBridge.getDesktopSettings().then(settings => {
      setBackground(settings.background_enabled); setShortcut(settings.voice_shortcut); setPcControlEnabled(settings.pc_control_enabled);
    }).catch(error => console.warn("No se pudieron cargar los ajustes nativos:", error));
  }, []);

  const { notification, notify, dismiss } = useToasts();

  useEffect(() => {
    let active = true;
    agentService.preferences().then(value => { if (active) setAgentEnabled(value.enabled); })
      .catch(error => console.info("Preferencias del agente no disponibles:", error));
    const update = (event: Event) => {
      const detail = (event as CustomEvent<AgentPreferences>).detail;
      if (detail && typeof detail.enabled === "boolean") setAgentEnabled(detail.enabled);
    };
    window.addEventListener("pseudovoice:agent-preferences-updated", update);
    return () => { active = false; window.removeEventListener("pseudovoice:agent-preferences-updated", update); };
  }, [userId]);

  useEffect(() => {
    if (!tauriBridge.isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async event => {
      if (background || closingAgentTasks.current) return;
      event.preventDefault();
      closingAgentTasks.current = true;
      try {
        const activeTasks = await agentService.tasks(100);
        await Promise.all(activeTasks.filter(task => ["queued", "running", "awaiting_approval"].includes(task.status))
          .map(task => aiInferenceService.interruptAgentTask(task.id).catch(() => undefined)));
      } finally {
        await getCurrentWindow().close();
      }
    }).then(stop => { unlisten = stop; });
    return () => unlisten?.();
  }, [background]);

  useEffect(() => {
    let active = true;
    userService.getProfile(userId).then((profile) => { if (active) setUserProfile(profile); })
      .catch((error) => console.info("Perfil local no disponible:", error));
    return () => { active = false; };
  }, [userId]);

  const { profiles, activeProfile, addCharacter, addCatalogCharacter, updateCharacter, deleteCharacter, selectActiveCharacter, isLoading: profilesLoading } =
    useVoiceProfiles(userId);
  const history = useConversations(userId, profiles);

  const session = useActiveSession({
    userId,
    onNotify: notify,
    active: view === "focus",
    pcControlEnabled,
  });
  currentConversationIdRef.current = conversationId;
  const { commitProfileSwitch } = session;

  useEffect(() => {
    const onTaskUpdated = (event: Event) => {
      const task = (event as CustomEvent<AgentTask>).detail;
      if (!task || task.conversationId !== currentConversationIdRef.current || !activeProfile) return;
      void conversationService.getMessagesByConversation(task.conversationId).then(rows => {
        if (task.conversationId !== currentConversationIdRef.current) return;
        session.loadConversationTranscript(rows.map(message => ({
          id: `${task.conversationId}-${message.id}`, role: message.role,
          speaker: message.role === "user" ? "Tú" : activeProfile.name,
          text: message.content, createdAt: message.createdAt,
        })), activeProfile.name);
      }).catch(error => console.warn("No se pudo actualizar el resultado de la tarea:", error));
    };
    window.addEventListener("pseudovoice:agent-task-updated", onTaskUpdated);
    return () => window.removeEventListener("pseudovoice:agent-task-updated", onTaskUpdated);
  }, [conversationId, activeProfile, session]);

  const parsedCharacterId = activeProfile ? Number.parseInt(activeProfile.id, 10) : NaN;
  const characterNumericId = Number.isFinite(parsedCharacterId) ? parsedCharacterId : null;

  async function startAgentTask(text: string) {
    if (!agentEnabled) throw new Error("Activa Modo agente en Configuración antes de iniciar una automatización.");
    if (!characterNumericId || !conversationId) throw new Error("Selecciona un personaje y abre una conversación antes de crear una tarea.");
    const created = await aiInferenceService.startAgentTask({ character_id: characterNumericId, conversation_id: conversationId, text });
    const rows = await conversationService.getMessagesByConversation(conversationId);
    session.loadConversationTranscript(rows.map(message => ({
      id: `${conversationId}-${message.id}`, role: message.role, speaker: message.role === "user" ? "Tú" : activeProfile?.name ?? "PseudoVoice",
      text: message.content, createdAt: message.createdAt,
    })), activeProfile?.name ?? "PseudoVoice");
    notify({ title: "Tarea añadida a la bandeja", description: `Ejecución #${created.id}. La conversación normal sigue independiente del navegador.`, variant: "info" });
  }

  async function restartAgentTask(task: AgentTask) {
    const rows = await conversationService.getMessagesByConversation(task.conversationId);
    const original = rows.find(message => message.turnId === task.runId && message.role === "user");
    if (!original) throw new Error("No se encontró el mensaje original en esta conversación; no se inició otra tarea.");
    await aiInferenceService.startAgentTask({ character_id: task.characterId, conversation_id: task.conversationId, text: original.content });
    notify({ title: "Nueva ejecución iniciada", description: "La ejecución anterior no se reanudó ni se repitieron acciones automáticamente.", variant: "info" });
  }

  useEffect(() => {
    if (profilesLoading || history.loadingConversations || conversationLoading || characterNumericId === null) return;
    const selected = history.conversations.find(item => item.id === conversationId);
    if (selected?.characterId === characterNumericId) return;
    if (suppressAutoCreateForRef.current === characterNumericId) return;
    const existing = history.conversations.find(item => item.characterId === characterNumericId);
    if (existing && conversationOpenError?.conversationId === existing.id) return;
    if (existing) void openConversation(existing.id, false).catch(() => undefined);
    else void createNewConversation(false);
  }, [profilesLoading, history.loadingConversations, history.conversations, characterNumericId, conversationId, conversationLoading, conversationOpenError]);

  // Single, always-on bridge: every graph mutation emits session_config to Python.
  useSessionConfigBridge({
    userId,
    characterId: characterNumericId,
    referenceAudioName: activeProfile?.referenceAudioPath?.startsWith("fish:") ? activeProfile.referenceAudioPath : activeProfile?.referenceAudioPath?.replace(/\\/g, "/").split("/").pop() ?? "",
    conversationId,
    responseLength,
    saveResponseAudio: tauriBridge.isTauri() && saveResponseAudio,
  });

  const handleSelectCharacter = useCallback(
    (profile: VoiceProfile) => {
      if (session.isProcessing) {
        notify({ title: "Espera la respuesta actual", description: "Podrás cambiar de personaje cuando termine la respuesta; el micrófono puede seguir activo.", variant: "warning" });
        return;
      }
      if (activeProfile?.id === profile.id) return;
      inferenceSocketService.prepareSessionSwitch();
      conversationRequestRef.current += 1;
      setConversationLoading(false);
      setConversationOpenError(null);
      suppressAutoCreateForRef.current = null;
      setConversationId(null);
      session.loadConversationTranscript([], profile.name);
      selectActiveCharacter(profile.id);
      const numericId = Number.parseInt(profile.id, 10);
      void commitProfileSwitch(
        Number.isNaN(numericId) ? profile.name : numericId,
        profile.name,
      );
    },
    [activeProfile?.id, selectActiveCharacter, commitProfileSwitch, session.isLive, session.isProcessing, notify],
  );

  const wakeStatus = useWakeActivation({
    enabled: wakeEnabled, phrase: wakePhrase, profiles,
    unavailable: settingsOpen || session.isLive || session.isProcessing || session.engineState === "OFFLINE",
    onWake: async (id, text, cancelled) => {
      const profile = profiles.find(item => Number(item.id) === id);
      if (!profile || cancelled()) return;
      handleSelectCharacter(profile);
      const deadline = Date.now() + 10000;
      while (!inferenceSocketService.isSessionReadyForCharacter(id)) {
        if (cancelled()) return;
        if (Date.now() > deadline) throw new Error("La conversación no está lista. Revisa la conexión y la voz del personaje.");
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
      if (cancelled()) return;
      notify({ title: `${profile.name} activado`, description: text ? "Procesando tu solicitud." : "Tienes 15 segundos para comenzar; esperaré a que termines la frase.", variant: "info" });
      await session.activateFromWake(text);
    },
  });

  async function openConversation(id: number, navigate = true) {
    if (session.isProcessing) {
      const message = "Espera a que termine la respuesta antes de cambiar de conversación.";
      setConversationOpenError({ conversationId: id, message });
      throw new Error(message);
    }
    const requestId = ++conversationRequestRef.current;
    inferenceSocketService.prepareSessionSwitch();
    setConversationOpenError(null);
    setConversationLoading(true);
    try {
      const item = history.conversations.find(conversation => conversation.id === id);
      if (!item) throw new Error("Esta conversación ya no está disponible.");
      const profile = profiles.find(candidate => Number(candidate.id) === item.characterId);
      if (!profile) throw new Error("El personaje de esta conversación ya no está disponible en tu cuenta.");
      const rows = await conversationService.getMessagesByConversation(id);
      if (requestId !== conversationRequestRef.current) return;
      const profileChanged = activeProfile?.id !== profile.id;
      history.selectConversation(id);
      setConversationId(id);
      selectActiveCharacter(profile.id);
      if (profileChanged) await commitProfileSwitch(Number(profile.id), profile.name);
      if (requestId !== conversationRequestRef.current) return;
      session.loadConversationTranscript(rows.map(message => ({
        id: `${id}-${message.id}`,
        role: message.role,
        speaker: message.role === "user" ? "Tú" : profile.name,
        text: message.content,
        createdAt: message.createdAt,
        savedAudioId: localAudioId(message.generatedAudioPath ?? (message.telemetryMetadata ?? message.telemetry_metadata)?.generated_audio_path),
      })), profile.name);
      inferenceSocketService.refreshSession(Number(profile.id), id);
      suppressAutoCreateForRef.current = null;
      if (navigate) setView("focus");
    } catch (error) {
      if (requestId === conversationRequestRef.current) {
        inferenceSocketService.refreshSession();
        setConversationOpenError({ conversationId: id, message: error instanceof Error ? error.message : "No se pudo cargar el chat. Comprueba la conexión e inténtalo de nuevo." });
        throw error;
      }
    } finally {
      if (requestId === conversationRequestRef.current) setConversationLoading(false);
    }
  }

  async function createNewConversation(explicit = true) {
    if (session.isProcessing) {
      notify({ title: "Espera la respuesta actual", description: "Espera a que termine la respuesta antes de abrir otro chat.", variant: "warning" });
      return;
    }
    if (!activeProfile) return;
    if (conversationLoading) {
      if (explicit) notify({ title: "Espera un momento", description: "La app está terminando el cambio de conversación actual.", variant: "info" });
      return;
    }
    if (explicit) suppressAutoCreateForRef.current = null;
    inferenceSocketService.prepareSessionSwitch();
    const requestId = ++conversationRequestRef.current;
    setConversationOpenError(null);
    setConversationLoading(true);
    try {
      const id = await history.createConversation(activeProfile);
      if (requestId !== conversationRequestRef.current) return;
      history.selectConversation(id);
      setConversationOpenError(null);
      setConversationId(id);
      session.loadConversationTranscript([], activeProfile.name);
      setView("focus");
    } catch {
      if (requestId === conversationRequestRef.current) inferenceSocketService.refreshSession();
      if (requestId === conversationRequestRef.current) notify({ title: "No se pudo crear la conversación", description: "Comprueba que Spring esté activo y vuelve a intentarlo.", variant: "error" });
    } finally {
      if (requestId === conversationRequestRef.current) setConversationLoading(false);
    }
  }

  const renameConversation = async (id: number, title: string) => {
    try {
      await history.renameSession(id, title);
      notify({ title: "Conversación renombrada", description: `El título ahora es “${title}”.`, variant: "success" });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No se pudo guardar el título. Comprueba la conexión e inténtalo de nuevo.");
    }
  };

  const deleteConversation = async (id: number) => {
    const deleted = history.conversations.find(item => item.id === id);
    if (!deleted) return;
    if (session.isLive || session.isProcessing) {
      notify({ title: "Espera a que termine la conversación", description: "Detén el micrófono y espera a que termine la respuesta antes de eliminar un chat.", variant: "warning" });
      return;
    }
    const nextForCharacter = history.conversations
      .filter(item => item.id !== id && item.characterId === deleted.characterId)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    const requestId = ++conversationRequestRef.current;
    setConversationLoading(true);
    try {
      const audioIds = await conversationService.getMessagesByConversation(id).then(rows => rows.flatMap(message => {
        const path = message.generatedAudioPath ?? (message.telemetryMetadata ?? message.telemetry_metadata)?.generated_audio_path;
        const audioId = localAudioId(path);
        return audioId ? [audioId] : [];
      })).catch(() => [] as string[]);
      await history.deleteSession(id);
      const cleanup = await Promise.allSettled(audioIds.map(audioId => tauriBridge.deleteGeneratedAudioArchive(audioId)));
      notify({ title: "Conversación eliminada", description: `“${deleted.title}” se eliminó del historial.`, variant: "success" });
      if (cleanup.some(result => result.status === "rejected")) {
        notify({ title: "Audio local pendiente de limpieza", description: "El chat se eliminó, pero algún WAV no pudo borrarse de este dispositivo.", variant: "warning" });
      }
      if (requestId !== conversationRequestRef.current) return;
      if (conversationId !== id) { setConversationLoading(false); return; }
      setConversationId(null);
      history.selectConversation(null);
      session.loadConversationTranscript([], activeProfile?.name ?? "PseudoVoice");
      if (nextForCharacter) {
        suppressAutoCreateForRef.current = null;
        try { await openConversation(nextForCharacter.id, false); }
        catch { /* El aviso persistente de apertura ofrece el reintento. */ }
      } else {
        suppressAutoCreateForRef.current = deleted.characterId ?? characterNumericId;
        setConversationOpenError(null);
        setConversationLoading(false);
      }
    } catch (error) {
      notify({ title: "No se pudo eliminar", description: error instanceof Error ? error.message : "Comprueba tu conexión e inténtalo de nuevo.", variant: "error" });
      if (requestId === conversationRequestRef.current) setConversationLoading(false);
    }
  };

  const handleAddCharacter = useCallback(async (name: string, voiceFile: File, avatarUrl?: string) => {
    await addCharacter(name, voiceFile, avatarUrl);
    notify({
      title: "Voz guardada",
      description: "La muestra está registrada en el motor de voz y el personaje ya está disponible.",
      variant: "success",
    });
  }, [addCharacter, notify]);

  const handleReconnect = useCallback(() => {
    inferenceSocketService.disconnect();
    inferenceSocketService.connect();
    notify({
      title: "Reconectando motor",
      description: "Estableciendo una nueva conexión con el pipeline de IA.",
      variant: "info",
    });
  }, [notify]);

  const characterMenuRef = useRef<HTMLDetailsElement>(null);
  const closeCharacterMenu = useCallback(() => {
    if (characterMenuRef.current) characterMenuRef.current.open = false;
  }, []);

  useEffect(() => {
    const handleClose = () => closeCharacterMenu();
    const handlePointerDown = (event: PointerEvent) => {
      if (characterMenuRef.current?.open && !characterMenuRef.current.contains(event.target as Node)) {
        characterMenuRef.current.open = false;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && characterMenuRef.current?.open) {
        characterMenuRef.current.open = false;
      }
    };
    window.addEventListener("pseudovoice:open-personality", handleClose);
    window.addEventListener("pseudovoice:edit-character", handleClose);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pseudovoice:open-personality", handleClose);
      window.removeEventListener("pseudovoice:edit-character", handleClose);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCharacterMenu]);

  useEffect(() => {
    const openMemorySettings = () => {
      setSettingsSection("memory");
      setSettingsOpen(true);
    };
    window.addEventListener("pseudovoice:open-memory-settings", openMemorySettings);
    return () => window.removeEventListener("pseudovoice:open-memory-settings", openMemorySettings);
  }, []);

  const handleOpenLogs = useCallback(() => setLogsDrawerOpen(true), []);
  const connected = session.engineState === "OK";
  const selectedName = activeProfile?.name ?? (profilesLoading ? "Cargando personaje" : profiles.length ? "Personaje no disponible" : "Sin personajes");

  return (
    <div className="pv-app relative flex h-screen w-full flex-row overflow-hidden bg-zinc-950 text-zinc-200">
      <AppSidebar profiles={profiles} conversations={history.conversations} previews={history.previews} selectedConversationId={conversationId} user={userProfile} fallbackUser={{ fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl }} view={view} onNavigate={setView} onSelectCharacter={handleSelectCharacter} onOpenConversation={id => { void openConversation(id).catch(() => undefined); }} onRenameConversation={renameConversation} onDeleteConversation={deleteConversation} busy={conversationLoading || session.isLive || session.isProcessing} onNewConversation={() => void createNewConversation()} onExploreVoices={() => setView("focus")} onOpenSettings={section => { setSettingsSection(section ?? "desktop"); setSettingsOpen(true); }} onSignOut={() => { inferenceSocketService.disconnect(); onSignOut(); }} />

      <div className="pv-app-main">
        <header className="pv-shell-header">
          <div className="pv-shell-identity">
            {activeProfile && <Avatar seed={activeProfile.avatarSeed} label={activeProfile.name} imageUrl={activeProfile.avatarUrl || activeProfile.sourceAvatarUrl} size={42} roundedClassName="rounded-full" decorative />}
            <div><p className="pv-eyebrow">{view === "focus" ? "CONVERSACIÓN" : "TU ESPACIO"}</p><h1>{view === "focus" ? selectedName : "Historial"}</h1>{view === "focus" && activeProfile && <small>{activeProfile.sourceName || activeProfile.archetype || "Voz del personaje"}</small>}</div>
          </div>
          <div className="pv-shell-actions"><AgentTaskTray onRestart={restartAgentTask} /><span className={`pv-engine-pill${connected ? " is-connected" : session.engineState === "DEGRADED" ? " is-degraded" : ""}`}><i />{connected ? "Motor listo" : session.engineState === "DEGRADED" ? "Conectando" : "Motor desconectado"}</span>{view === "focus" && activeProfile && <details ref={characterMenuRef} className="pv-character-menu"><summary aria-label={`Opciones de ${activeProfile.name}`}>•••</summary><div><button onClick={() => { closeCharacterMenu(); window.dispatchEvent(new CustomEvent("pseudovoice:open-personality")); }}>Reglas del personaje</button><button onClick={() => { closeCharacterMenu(); window.dispatchEvent(new CustomEvent("pseudovoice:edit-character")); }}>Editar personaje</button><button className="pv-character-menu-delete" disabled={conversationLoading || session.isLive || session.isProcessing} onClick={() => { closeCharacterMenu(); window.dispatchEvent(new CustomEvent("pseudovoice:delete-character")); }}>Eliminar personaje</button></div></details>}</div>
        </header>
        {conversationOpenError && <div className="pv-conversation-load-error" role="alert"><div><strong>No se pudo abrir esta conversación.</strong><span>{conversationOpenError.message}</span></div><button type="button" onClick={() => void openConversation(conversationOpenError.conversationId).catch(() => undefined)}>Reintentar</button></div>}
        {wakeEnabled && <div className="pv-wake-status"><span role="status">{wakeStatus} · Di «{wakePhrase} {activeProfile?.name ?? "nombre del personaje"}»</span><button type="button" onClick={() => { setWakeEnabled(false); savePreference(`wake-enabled-${userId}`, "false"); }}>Desactivar activación</button></div>}
        <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
          {view === "focus" ? (
            <ConversationView
              conversationLoading={conversationLoading}
              activeProfile={activeProfile}
              onUpload={handleAddCharacter}
              onChoose={addCatalogCharacter}
              onUpdate={updateCharacter}
              onDelete={async characterId => {
                await deleteCharacter(characterId);
                if (activeProfile?.id === characterId) {
                  setConversationId(null);
                  session.loadConversationTranscript([], profiles.find(profile => profile.id !== characterId)?.name ?? "PseudoVoice");
                }
              }}
              onReconnect={handleReconnect}
              session={session}
              responseLength={responseLength}
              onResponseLengthChange={value => { setResponseLength(value); savePreference("response-length", value); }}
              onOpenLogs={handleOpenLogs}
              conversationTitle={history.conversations.find(item => item.id === conversationId)?.title ?? ""}
              userId={userId}
              conversationId={conversationId}
              agentEnabled={agentEnabled}
              onStartAgentTask={startAgentTask}
            />
          ) : null}

          {view === "logs" ? <HistoryTelemetryView history={history} busy={conversationLoading || session.isLive || session.isProcessing} onRenameConversation={renameConversation} onDeleteConversation={deleteConversation} onContinue={id => openConversation(id)} /> : null}
        </main>
      </div>

      <ToastViewport notification={notification} onDismiss={dismiss} />

      {/* Slide-over telemetry and logs drawer */}
      <SessionLogsDrawer
        open={logsDrawerOpen}
        onClose={() => setLogsDrawerOpen(false)}
        onNotify={notify}
        userId={userId}
        profiles={profiles}
        sessionId={session.sessionId}
        build={BUILD}
      />

      <SettingsHub
        open={settingsOpen}
        onClose={closeSettings}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        identity={userProfile ?? { fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl }}
        theme={theme}
        onThemeChange={onThemeChange}
        profiles={profiles}
        characterId={characterNumericId}
        memoryRevision={session.memoryRevision}
        operator={session.operator}
        build={BUILD}
        audioFormat={session.audioFormat}
        engineState={session.engineState}
        characterName={activeProfile?.name ?? null}
        onToggleMic={() => void session.toggleMic()}
        onReconnect={handleReconnect}
        onOpenLogs={handleOpenLogs}
        backgroundEnabled={background}
        shortcut={shortcut}
        wakeEnabled={wakeEnabled}
        wakePhrase={wakePhrase}
        wakeStatus={wakeStatus}
        onWakeEnabledChange={enabled => { setWakeEnabled(enabled); savePreference(`wake-enabled-${userId}`, String(enabled)); }}
        onWakePhraseChange={phrase => { setWakePhrase(phrase); savePreference(`wake-phrase-${userId}`, phrase); }}
        pcControlEnabled={pcControlEnabled}
        saveResponseAudio={saveResponseAudio}
        onSaveResponseAudioChange={enabled => { setSaveResponseAudio(enabled); savePreference("save-response-audio", String(enabled)); }}
        onBackgroundChange={async enabled => { await tauriBridge.setBackgroundEnabled(enabled); setBackground(enabled); }}
        onShortcutChange={async value => { await tauriBridge.setVoiceShortcut(value); setShortcut(value); }}
        onPcControlChange={async enabled => { await tauriBridge.setPcControlEnabled(enabled); setPcControlEnabled(enabled); }}
      />
    </div>
  );
}
