import { useEffect, useRef, useState } from "react";
import type { UseActiveSessionResult } from "../hooks/useActiveSession";
import type { VoiceProfile } from "../types/voice";
import { aiInferenceService, type CatalogVoice } from "../services/aiInferenceService";
import { Avatar } from "./ui/Avatar";
import { VoiceLibrary } from "./VoiceLibrary";
import { readPreference, savePreference } from "../lib/preferences";
import { RulesPersonalityDialog } from "./RulesPersonalityDialog";
import { ArrowUpRightIcon, MicIcon } from "./ui/icons";
import { tauriBridge } from "../services/tauriBridge";
import { SavedAudioButton } from "./SavedAudioButton";
import { classifyMessageIntent } from "../lib/messageIntent";

function jpegAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la foto."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("El archivo de imagen no es válido."));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        let scale = Math.min(1, 512 / Math.max(image.width, image.height));
        for (let attempt = 0; attempt < 8; attempt++) {
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) break;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const result = canvas.toDataURL("image/jpeg", Math.max(0.45, 0.86 - attempt * 0.06));
          if (result.length <= 330_000) { resolve(result); return; }
          scale *= 0.8;
        }
        reject(new Error("La foto no pudo comprimirse a menos de 256 KB."));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ConversationView({ activeProfile, conversationLoading, session, onUpload, onChoose, onOpenLogs, conversationTitle, onUpdate, onDelete, onReconnect, responseLength, onResponseLengthChange, userId, conversationId, agentEnabled, onStartAgentTask }: {
  activeProfile: VoiceProfile | null;
  conversationLoading: boolean;
  session: UseActiveSessionResult;
  onUpload: (name: string, file: File, avatar?: string) => Promise<void>;
  onChoose: (name: string, voice: CatalogVoice) => Promise<void>;
  onOpenLogs: () => void;
  conversationTitle: string;
  onUpdate: (profile: VoiceProfile, name: string, avatar: string | null, voice?: CatalogVoice, personalityPrompt?: string | null) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
  onReconnect: () => void;
  responseLength: "short" | "normal" | "long";
  onResponseLengthChange: (value: "short" | "normal" | "long") => void;
  userId: number;
  conversationId: number | null;
  agentEnabled: boolean;
  onStartAgentTask: (text: string) => Promise<void>;
}) {
  const [library, setLibrary] = useState(false);
  const [text, setText] = useState("");
  const [dismissedMemoryCharacters, setDismissedMemoryCharacters] = useState<Set<string>>(() => {
    try {
      const saved: unknown = JSON.parse(readPreference(`memory-notice-dismissed:${userId}`, "[]"));
      return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
    } catch { return new Set(); }
  });
  useEffect(() => {
    const input = document.getElementById("conversation-message") as HTMLTextAreaElement | null;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }, [text]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoiceProfile | null>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!deleteTarget) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelDeleteRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [deleteTarget]);
  const [reassign, setReassign] = useState<VoiceProfile | null>(null);
  const [editing, setEditing] = useState<VoiceProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [clearAvatar, setClearAvatar] = useState(false);
  const [personalityProfile, setPersonalityProfile] = useState<VoiceProfile | null>(null);
  const [sessionPanelHidden, setSessionPanelHidden] = useState(() => readPreference("session-panel-hidden", "true") !== "false");
  const end = useRef<HTMLDivElement>(null);
  const nearEnd = useRef(true);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const savedAvatarUrl = editing?.avatarUrl || editing?.sourceAvatarUrl || null;
  const originalAvatarUrl = editing?.sourceAvatarUrl || (editing?.avatarUrl?.startsWith("data:image/jpeg;base64,") ? null : editing?.avatarUrl) || null;
  const editAvatarPreview = editAvatar || (clearAvatar ? originalAvatarUrl : savedAvatarUrl);
  const dismissMemoryNotice = () => {
    if (!activeProfile) return;
    setDismissedMemoryCharacters(current => {
      const next = new Set(current);
      next.add(activeProfile.id);
      savePreference(`memory-notice-dismissed:${userId}`, JSON.stringify([...next]));
      return next;
    });
  };
  useEffect(() => {
    const openLibrary = () => setLibrary(true);
    const openRules = () => activeProfile && setPersonalityProfile(activeProfile);
    const editCharacter = () => { if (activeProfile) { setEditing(activeProfile); setEditName(activeProfile.name); setEditAvatar(""); setClearAvatar(false); } };
    window.addEventListener("pseudovoice:open-voice-library", openLibrary);
    window.addEventListener("pseudovoice:open-personality", openRules);
    window.addEventListener("pseudovoice:edit-character", editCharacter);
    return () => { window.removeEventListener("pseudovoice:open-voice-library", openLibrary); window.removeEventListener("pseudovoice:open-personality", openRules); window.removeEventListener("pseudovoice:edit-character", editCharacter); };
  }, [activeProfile]);
  useEffect(() => { nearEnd.current = true; setShowLatestButton(false); }, [conversationTitle]);
  useEffect(() => {
    if (nearEnd.current) end.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
    else setShowLatestButton(true);
  }, [session.transcript]);
  async function removeCharacter(profile: VoiceProfile, confirmed = false) {
    if (sending || conversationLoading || session.isLive || session.isProcessing) { setError("Espera a que termine la operación y detén el micrófono antes de eliminar este personaje."); return; }
    if (!confirmed) { setError(""); setDeleteTarget(profile); return; }
    setSending(true); setError("");
    try { await onDelete(profile.id); setEditing(null); setDeleteTarget(null); }
    catch (reason) { setError(String(reason)); }
    finally { setSending(false); }
  }

  useEffect(() => {
    const deleteCharacter = () => { if (activeProfile) void removeCharacter(activeProfile); };
    window.addEventListener("pseudovoice:delete-character", deleteCharacter);
    return () => window.removeEventListener("pseudovoice:delete-character", deleteCharacter);
  }, [activeProfile, sending, conversationLoading, session.isLive, session.isProcessing, onDelete]);

  return <div className={`pv-workspace is-characters-collapsed${sessionPanelHidden ? " is-session-panel-hidden" : ""}`}>
    <section className="pv-conversation" aria-label="Conversación">
      {session.engineState !== "OK" && <div className="pv-engine-notice" role="status"><span className="pv-engine-notice-icon" aria-hidden="true">!</span><div><strong>{session.engineState === "OFFLINE" ? "Fallo de conexión con el motor de IA." : "El motor está iniciando o funciona de forma limitada."}</strong><p>Revisa que el servicio de voz esté activo y vuelve a intentarlo.</p></div><button onClick={onReconnect}>Reintentar</button></div>}
      <div className="pv-message-list" role="log" aria-label="Mensajes" onScroll={event => {
        const element = event.currentTarget;
        const isNearEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        nearEnd.current = isNearEnd;
        setShowLatestButton(!isNearEnd && session.transcript.length > 0);
      }}>
        {!session.transcript.length && <div className="pv-welcome"><div className="pv-welcome-portrait">{activeProfile ? <Avatar className="pv-avatar" seed={activeProfile.avatarSeed} label={activeProfile.name} palette={activeProfile.palette} imageUrl={activeProfile.avatarUrl || activeProfile.sourceAvatarUrl} size={92} roundedClassName="rounded-full" /> : <span className="pv-welcome-orb">◌</span>}</div><h2>{activeProfile ? `¿Qué te gustaría conversar?` : "Dale voz a tus ideas"}</h2><p>{activeProfile ? `Escribe o habla con ${activeProfile.name}.` : "Elige una voz del catálogo Fish o crea un personaje con tu propia muestra de audio."}</p>{activeProfile && <div className="pv-starters">{["¿Cómo estás hoy?", "Ayúdame con una idea", "Quiero contarte algo"].map(suggestion => <button type="button" key={suggestion} onClick={() => setText(suggestion)}>{suggestion}</button>)}</div>}{!activeProfile && <button className="pv-primary" onClick={() => setLibrary(true)}>Explorar voces</button>}</div>}
        {session.transcript.map(line => <div className={`pv-message-row pv-message-row-${line.role}`} key={line.id}>{line.role === "assistant" && activeProfile && <Avatar className="pv-message-avatar" seed={activeProfile.avatarSeed} label={activeProfile.name} palette={activeProfile.palette} imageUrl={activeProfile.avatarUrl || activeProfile.sourceAvatarUrl} size={34} roundedClassName="rounded-full" decorative />}<article className={`pv-message pv-message-${line.role}`}><div className="pv-message-meta"><small>{line.speaker}</small>{line.createdAt && !Number.isNaN(Date.parse(line.createdAt)) && <time dateTime={line.createdAt}>{new Date(line.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}{line.savedAudioId && tauriBridge.isTauri() && <SavedAudioButton turnId={line.savedAudioId} />}<button type="button" aria-label={`Copiar mensaje de ${line.speaker}`} onClick={() => { void navigator.clipboard.writeText(line.text).then(() => setError("")).catch(() => setError("No pude copiar el mensaje. Comprueba los permisos del portapapeles.")); }}>Copiar</button></div><p>{line.text}</p></article></div>)}
        {showLatestButton && <button type="button" className="pv-latest-message-button" onClick={() => {
          nearEnd.current = true;
          setShowLatestButton(false);
          end.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
        }}>Volver al último mensaje ↓</button>}
        <div ref={end} />
      </div>
      {session.conversationAccessIssue && <div className="pv-conversation-access-notice" role="alert"><span className="pv-engine-notice-icon" aria-hidden="true">!</span><div><strong>No pude abrir esta conversación</strong><p>Puede que no esté vinculada al personaje seleccionado o a tu cuenta. Revisa tus conversaciones guardadas y vuelve a seleccionar el personaje.</p></div><button onClick={onOpenLogs}>Abrir historial</button></div>}
      {activeProfile && session.memoryRevision > 0 && !dismissedMemoryCharacters.has(activeProfile.id) && <div className="pv-memory-notice" role="status"><button type="button" className="pv-memory-notice-link" onClick={() => { dismissMemoryNotice(); window.dispatchEvent(new CustomEvent("pseudovoice:open-memory-settings")); }}>La memoria de este personaje cambió. Revisar recuerdos en Configuración → Memoria</button><button type="button" className="pv-memory-notice-dismiss" aria-label="Cerrar aviso de memoria" title="Cerrar aviso" onClick={dismissMemoryNotice}>×</button></div>}
      {(session.needsVoiceReassignment || (activeProfile && !activeProfile.referenceAudioPath?.startsWith("fish:"))) && <div className="pv-memory-notice">Esta referencia de voz necesita una voz Fish. <button onClick={() => { setReassign(activeProfile); setLibrary(true); }}>Reasignar voz</button></div>}
      {conversationLoading && <p className="pv-loading-chat" role="status">Abriendo conversación…</p>}
      <footer className="pv-composer-area"><form className="pv-composer" onSubmit={async event => {
        event.preventDefault(); setSending(true); setError("");
        try {
          const intent = classifyMessageIntent(text);
          if (intent === "web_task" || (intent === "ambiguous_web_task" && window.confirm("¿Quieres ejecutar este pedido en el navegador? Si eliges No, se enviará como conversación normal."))) {
            if (!agentEnabled) throw new Error("Activa la automatización web en Configuración → Control del PC para iniciar tareas en el navegador.");
            if (!conversationId) throw new Error("Abre una conversación antes de iniciar una tarea web.");
            await onStartAgentTask(text.trim());
          } else {
            await session.sendText(text.trim());
          }
          setText("");
        } catch (reason) { setError(String(reason)); } finally { setSending(false); }
      }}><label className="pv-composer-label" htmlFor="conversation-message">Tu conversación con {activeProfile?.name ?? "PseudoVoice"}</label><textarea id="conversation-message" aria-label="Mensaje" rows={2} maxLength={4000} disabled={!activeProfile || session.isProcessing} placeholder={activeProfile ? `Escribe a ${activeProfile.name}…` : "Crea un personaje para comenzar"} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="pv-composer-controls"><div className="pv-composer-options"><button type="button" className={`pv-mic-button${session.isLive ? " is-live" : ""}`} disabled={!activeProfile || session.isProcessing} aria-pressed={session.isLive} onClick={() => void session.toggleMic()}><MicIcon size={17} />{session.isLive ? "Detener micrófono" : "Hablar"}</button><label className="pv-muted pv-duration-control">Respuesta<select aria-label="Duración de respuesta" value={responseLength} onChange={event => onResponseLengthChange(event.target.value as "short" | "normal" | "long")}><option value="short">Breve</option><option value="normal">Normal · 10–15 s</option><option value="long">Detallada</option></select></label><span className={`pv-session-status pv-session-${session.statusLabel === "ESCUCHANDO" ? "listening" : session.statusLabel === "HABLANDO" ? "speaking" : session.isProcessing ? "processing" : "idle"}`} role="status"><span aria-hidden="true" />{session.statusLabel}</span></div><button aria-label={sending ? "Enviando mensaje" : "Enviar mensaje"} title="Enviar mensaje" className="pv-send-button pv-primary" disabled={!activeProfile || !text.trim() || sending || session.isProcessing || session.engineState === "OFFLINE"}>{sending ? <span aria-hidden="true">…</span> : <ArrowUpRightIcon size={23} />}</button></div></form>{error && <p role="alert" className="pv-error">{error}</p>}<p className="pv-composer-hint">Las tareas web explícitas se detectan automáticamente y conservan sus autorizaciones. Las demás solicitudes siguen como conversación normal.</p></footer>
    </section>
    <aside className="pv-session-sidebar" aria-label="Detalles de la sesión">
      <div className="pv-session-sidebar-title"><p className="pv-eyebrow">Sesión</p><button className="pv-collapse-toggle" aria-label={sessionPanelHidden ? "Mostrar panel de sesión" : "Ocultar panel de sesión"} title={sessionPanelHidden ? "Mostrar sección" : "Ocultar sección"} aria-expanded={!sessionPanelHidden} onClick={() => setSessionPanelHidden(value => { const next = !value; savePreference("session-panel-hidden", String(next)); return next; })}>{sessionPanelHidden ? "‹" : "›"}</button></div>
      <section className="pv-session-card"><dl><div><dt>Personaje</dt><dd>{activeProfile?.name ?? "Sin seleccionar"}</dd></div><div><dt>Voz</dt><dd>{activeProfile?.sourceName || (activeProfile?.referenceAudioPath?.startsWith("fish:") ? "Fish Audio" : "Voz propia") || "—"}</dd></div><div><dt>Respuesta</dt><dd>{responseLength === "short" ? "Breve" : responseLength === "long" ? "Detallada" : "10–15 s"}</dd></div></dl></section>
      <section className="pv-danger-zone"><p className="pv-danger-title">Zona de peligro</p><p>Eliminar a {activeProfile?.name || "este personaje"} borra su voz y sus recuerdos. Te pediremos confirmar.</p><button disabled={!activeProfile || sending || session.isLive || session.isProcessing} onClick={() => activeProfile && void removeCharacter(activeProfile)}>Eliminar personaje</button>{(session.isLive || session.isProcessing) && <small>Detén el micrófono y espera a que termine la respuesta.</small>}</section>
      <p className="pv-session-footnote">PseudoVoice · Escritorio</p>
    </aside>
    {deleteTarget && <div className="pv-overlay"><section ref={deleteDialogRef} className="pv-dialog pv-delete-character-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-character-title" aria-describedby="delete-character-warning" onKeyDown={event => {
      if (event.key === "Escape" && !sending) { event.stopPropagation(); setDeleteTarget(null); }
      if (event.key === "Tab") {
        const controls = Array.from(deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}><header><h2 id="delete-character-title">¿Eliminar a {deleteTarget.name}?</h2></header><p id="delete-character-warning">Se eliminarán este personaje y su historial, reglas y recuerdos asociados. Esta acción no se puede deshacer.</p>{error && <p className="pv-error" role="alert">{error}</p>}<div className="pv-actions"><button ref={cancelDeleteRef} type="button" disabled={sending} onClick={() => setDeleteTarget(null)}>Cancelar</button><button type="button" className="pv-danger" disabled={sending || conversationLoading || session.isLive || session.isProcessing} onClick={() => void removeCharacter(deleteTarget, true)}>{sending ? "Eliminando…" : "Eliminar personaje"}</button></div></section></div>}
    {library && <VoiceLibrary initialName={reassign?.name} reassigning={Boolean(reassign)} onClose={() => { setLibrary(false); setReassign(null); }} onUpload={async (name, file, avatar) => {
      if (!reassign) return onUpload(name, file, avatar);
      const path = await aiInferenceService.uploadReferenceVoice(`${crypto.randomUUID()}.${file.name.toLowerCase().endsWith(".mp3") ? "mp3" : "wav"}`, file, name);
      await onUpdate({ ...reassign, referenceAudioPath: path, sourceVoiceId: null, sourceName: null, sourceAvatarUrl: null }, name, reassign.avatarUrl?.startsWith("data:image/jpeg") ? reassign.avatarUrl : null);
    }} onChoose={async (name, voice) => {
      if (!reassign) return onChoose(name, voice);
      await onUpdate(reassign, name, reassign.avatarUrl?.startsWith("data:image/jpeg") ? reassign.avatarUrl : null, voice);
    }} />}
    {personalityProfile && <RulesPersonalityDialog profile={personalityProfile} userId={userId} onUpdate={onUpdate} onClose={() => setPersonalityProfile(null)} />}
    {editing && <div className="pv-overlay"><form className="pv-dialog pv-form" role="dialog" aria-modal="true" aria-labelledby="edit-character-title" onSubmit={async event => {
      event.preventDefault(); setSending(true); setError("");
      try { await onUpdate(editing, editName, clearAvatar ? "" : editAvatar || null); setEditing(null); } catch (reason) { setError(String(reason)); } finally { setSending(false); }
    }}><h2 id="edit-character-title">Editar personaje</h2><label>Nombre<input autoFocus required maxLength={100} value={editName} onChange={event => setEditName(event.target.value)} /></label><p className="pv-muted">La voz del catálogo conserva su imagen original. Puedes subir una foto JPEG personalizada.</p><label>Subir foto (máximo 256 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 256 * 1024) { setError("La foto debe pesar menos de 256 KB."); return; }
      try { setEditAvatar(await jpegAvatar(file)); setClearAvatar(false); setError(""); } catch (reason) { setError(String(reason)); }
    }} /></label><Avatar seed={editing.avatarSeed} label={editName} imageUrl={editAvatarPreview} size={64} /><button type="button" disabled={sending} onClick={() => { setEditAvatar(""); setClearAvatar(true); }}>Usar foto original</button><div className="pv-actions"><button type="button" disabled={sending} onClick={() => { setReassign(editing); setLibrary(true); setEditing(null); }}>Cambiar voz</button></div>{error && <p role="alert" className="pv-error">{error}</p>}<div className="pv-actions"><button type="button" disabled={sending} onClick={() => setEditing(null)}>Cancelar</button><button className="pv-primary" disabled={sending || !editName.trim()}>Guardar cambios</button></div></form></div>}
  </div>;
}
