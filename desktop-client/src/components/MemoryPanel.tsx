import { useCallback, useEffect, useState } from "react";
import type { VoiceProfile } from "../types/voice";
import {
  memoryService,
  type MemoryActivity,
  type MemoryGroup,
  type MemoryGroupWrite,
  type MemoryMode,
  type MemoryPreferences,
  type MemoryScope,
  type MemoryWrite,
  type UserMemory,
} from "../services/memoryService";
import { aiInferenceService } from "../services/aiInferenceService";

const scopeLabel: Record<MemoryScope, string> = { private: "Privada", group: "Grupo", all: "Todos los personajes" };
const modeLabel: Record<MemoryMode, string> = { automatic: "Automática", suggested: "Con sugerencias", manual: "Manual" };
type Tab = "saved" | "suggestions" | "sharing";

export function MemoryPanel({ profiles, characterId, characterName, refreshKey = 0 }: { profiles: VoiceProfile[]; characterId: number | null; characterName?: string; refreshKey?: number }) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [activity, setActivity] = useState<MemoryActivity[]>([]);
  const [preferences, setPreferences] = useState<MemoryPreferences>({ mode: "suggested", sharedConsent: false, sensitiveConsent: false, updatedAt: "" });
  const [usage, setUsage] = useState<{ extraction_input_tokens: number; extraction_output_tokens: number; extraction_cost_usd: number; retrieval_tokens_estimate: number; created: number; updated: number; skipped: number } | null>(null);
  const [tab, setTab] = useState<Tab>("saved");
  const [scope, setScope] = useState<MemoryScope | "">("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | undefined>();
  const [draft, setDraft] = useState<MemoryWrite | null>(null);
  const [groupId, setGroupId] = useState<number | undefined>();
  const [groupDraft, setGroupDraft] = useState<MemoryGroupWrite | null>(null);

  const load = useCallback(async () => {
    const [items, catalog, prefs, events, totals] = await Promise.all([
      memoryService.list(), memoryService.groups(), memoryService.preferences(), memoryService.activity(), memoryService.usage(),
    ]);
    setMemories(items); setGroups(catalog); setPreferences(prefs); setActivity(events); setUsage(totals);
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void Promise.all([memoryService.list(), memoryService.groups(), memoryService.preferences(), memoryService.activity(), memoryService.usage()])
      .then(([items, catalog, prefs, events, totals]) => {
        if (!disposed) { setMemories(items); setGroups(catalog); setPreferences(prefs); setActivity(events); setUsage(totals); setError(""); }
      })
      .catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [refreshKey, characterId]);

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); setDraft(null); setGroupDraft(null); setNotice("Cambios guardados."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function savePreferences() {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await memoryService.savePreferences({ mode: preferences.mode, sharedConsent: preferences.sharedConsent, sensitiveConsent: preferences.sensitiveConsent });
      setPreferences(saved);
      await load();
      setNotice("Preferencias guardadas. La extracción por lotes usará esta configuración.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = memories.filter(item => item.approved === (tab === "saved")
    && (!scope || item.scope === scope)
    && (!normalizedQuery || item.content.toLocaleLowerCase().includes(normalizedQuery)
      || (profiles.find(profile => Number(profile.id) === item.characterId)?.name || "").toLocaleLowerCase().includes(normalizedQuery))
    && (!characterId || item.characterId === characterId || item.scope === "all"
      || (item.scope === "group" && groups.some(group => group.id === item.groupId && group.characterIds.includes(characterId)))));
  const visibleActivity = activity.filter(event => !characterId || event.characterId === characterId);

  return <section className="pv-memory-panel" aria-label="Gestión de memorias">
    <header>
      <p className="pv-eyebrow">Centro de memoria</p>
      <h2>{characterName ? `Memorias de ${characterName}` : "Memorias de tus personajes"}</h2>
      <p className="pv-muted">Revisa qué recuerda cada personaje, cómo lo usa y qué datos comparte.</p>
    </header>
    <div className="pv-tabs pv-memory-tabs" role="tablist" aria-label="Memoria en configuración">
      <button role="tab" aria-selected={tab === "saved"} aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>Guardado</button>
      <button role="tab" aria-selected={tab === "suggestions"} aria-pressed={tab === "suggestions"} onClick={() => setTab("suggestions")}>Sugerencias</button>
      <button role="tab" aria-selected={tab === "sharing"} aria-pressed={tab === "sharing"} onClick={() => setTab("sharing")}>Compartir</button>
    </div>
    {error && <p role="alert" className="pv-error">{error}</p>}
    {notice && <p role="status" className="pv-memory-notice">{notice}</p>}
    {loading ? <p className="pv-muted">Cargando memorias…</p> : <>
      {tab === "saved" && <div className="pv-memory-preferences">
      <article className="pv-memory-card">
        <h3>Cómo guardar recuerdos</h3>
        <p className="pv-muted">Elige qué debe hacer PseudoVoice con la información útil de tus conversaciones.</p>
        <label>Modo<select value={preferences.mode} disabled={busy} onChange={event => setPreferences({ ...preferences, mode: event.target.value as MemoryMode })}>{Object.entries(modeLabel).map(([value, label]) => <option key={value} value={value}>{label === "Manual" ? "Desactivado" : label}</option>)}</select></label>
        <p className="pv-muted">Automática los guarda por ti. Con sugerencias te pregunta primero. Desactivado no crea recuerdos automáticamente.</p>
        <label className="pv-check"><input type="checkbox" checked={preferences.sensitiveConsent} disabled={busy} onChange={event => setPreferences({ ...preferences, sensitiveConsent: event.target.checked })} /> Permitir guardar datos sensibles que marque expresamente</label>
        <p className="pv-muted">Solo se guardan cifrados y de forma privada. El servidor debe tener configurada la clave de cifrado.</p>
      </article>
      <article className="pv-memory-card">
        <h3>Consumo</h3>
        <div className="pv-memory-usage-grid">
          <div><strong>{usage?.extraction_input_tokens ?? 0}</strong><small>tokens de entrada</small></div>
          <div><strong>{usage?.extraction_output_tokens ?? 0}</strong><small>tokens de salida</small></div>
          <div><strong>{usage?.retrieval_tokens_estimate ?? 0}</strong><small>tokens estimados en recuerdos recuperados</small></div>
          <div><strong>{usage && usage.extraction_cost_usd > 0 ? `$${usage.extraction_cost_usd.toFixed(4)}` : "—"}</strong><small>{usage && usage.extraction_cost_usd > 0 ? "costo de extracción" : "configura tarifas para estimar costo"}</small></div>
        </div>
        <p className="pv-muted">La recuperación usa embeddings locales; el total de contexto es una estimación. Las tarifas se configuran en el servicio de inferencia.</p>
      </article>
      <div className="pv-actions"><button className="pv-primary" disabled={busy} onClick={() => void savePreferences()}>{busy ? "Guardando…" : "Guardar configuración de guardado"}</button></div>
    </div>}
      {tab === "sharing" && <>
      <article className="pv-memory-card"><h3>Recuerdos por personaje</h3><p className="pv-muted">Por defecto, cada personaje usa sus propios recuerdos.</p><label className="pv-check"><input type="checkbox" checked={preferences.sharedConsent} disabled={busy} onChange={event => setPreferences({ ...preferences, sharedConsent: event.target.checked })} /> Permitir compartir recuerdos entre personajes</label><p className="pv-muted">Al activarlo, podrás elegir en cada recuerdo si es privado, de un grupo o para todos tus personajes.</p><button className="pv-primary" disabled={busy} onClick={() => void savePreferences()}>{busy ? "Guardando…" : "Guardar preferencia para compartir"}</button></article>
      {!preferences.sharedConsent && <p className="pv-memory-notice">El uso compartido está desactivado. Los recuerdos no pasarán a otros personajes.</p>}
      <button disabled={busy} onClick={() => { setGroupId(undefined); setGroupDraft({ name: "", personalityInstructions: null, characterIds: [] }); }}>+ Crear grupo</button>
      {!groups.length && <p className="pv-muted">Crea un grupo para compartir instrucciones y recuerdos entre personajes.</p>}
      {groups.map(group => <article className="pv-memory-card" key={group.id}><strong>{group.name}</strong><p>{group.characterIds.map(id => profiles.find(profile => Number(profile.id) === id)?.name || "Personaje no disponible").join(", ") || "Sin miembros"}</p>{group.personalityInstructions && <p className="pv-muted">{group.personalityInstructions}</p>}<div className="pv-actions"><button disabled={busy} onClick={() => { setGroupId(group.id); setGroupDraft({ name: group.name, personalityInstructions: group.personalityInstructions, characterIds: group.characterIds }); }}>Editar</button><button disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar el grupo ${group.name}?`)) void mutate(() => memoryService.removeGroup(group.id)); }}>Eliminar</button></div></article>)}
      </>}
      {(tab === "saved" || tab === "suggestions") && <>
      {tab === "saved" && <h3 className="pv-memory-subheading">Recuerdos guardados</h3>}
      <label className="pv-memory-search">Buscar por contenido o personaje<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Busca en tus recuerdos…" /></label>
      <div className="pv-form-row"><label>Alcance<select value={scope} onChange={event => setScope(event.target.value as MemoryScope | "")}><option value="">Todos los alcances</option>{Object.entries(scopeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{tab === "saved" && <button disabled={busy || !characterId} onClick={() => { setEditing(undefined); setDraft({ characterId: characterId!, content: "", scope: "private", groupId: null, approved: true, sensitive: false }); }}>+ Añadir recuerdo</button>}</div>
      {!visible.length && <p className="pv-muted">{tab === "suggestions" ? "No hay sugerencias pendientes." : "No hay recuerdos que coincidan con la búsqueda."}</p>}
      {visible.map(memory => <article key={memory.id} className="pv-memory-card">
        <div className="pv-memory-activity-heading"><span className="pv-badge">{scopeLabel[memory.scope]}{memory.groupId ? ` · ${groups.find(group => group.id === memory.groupId)?.name || "Grupo no disponible"}` : ""}</span><span className="pv-badge">{memory.origin === "automatic" ? "Automática" : memory.origin === "suggested" ? "Sugerencia" : "Manual"}</span>{memory.sensitive && <span className="pv-badge">Sensible · cifrada</span>}</div>
        <p>{memory.content}</p>
        <small className="pv-muted">{profiles.find(profile => Number(profile.id) === memory.characterId)?.name || "Personaje no disponible"} · {Number.isNaN(Date.parse(memory.createdAt)) ? "" : new Date(memory.createdAt).toLocaleDateString()}</small>
        <div className="pv-actions"><button disabled={busy} onClick={() => { setEditing(memory.id); setDraft({ characterId: memory.characterId, content: memory.content, scope: memory.scope, groupId: memory.groupId, approved: true, sensitive: memory.sensitive }); }}>{memory.approved ? "Editar" : "Revisar y guardar"}</button><button disabled={busy} onClick={() => { if (window.confirm(memory.approved ? "¿Eliminar este recuerdo?" : "¿Descartar esta sugerencia?")) void mutate(() => memoryService.remove(memory.id)); }}>{memory.approved ? "Eliminar" : "Descartar"}</button></div>
      </article>)}
      </>}
      {tab === "saved" && <details className="pv-memory-activity-details"><summary>Actividad reciente</summary><div className="pv-memory-activity">
        {!visibleActivity.length && <p className="pv-muted">Aún no hay actividad para este personaje.</p>}
        {visibleActivity.map(event => <article className="pv-memory-card" key={event.id}><div className="pv-memory-activity-heading"><strong>{event.action === "created" ? "Recuerdo creado" : event.action === "updated" ? "Recuerdo actualizado" : event.action === "retrieved" ? "Recuerdos usados en una respuesta" : "Cambio deshecho"}</strong><span className="pv-badge">{event.source === "automatic" ? "Automático" : event.source === "suggested" ? "Sugerencia" : event.source === "system" ? "Sistema" : "Manual"}</span></div>{event.contentPreview && <p>{event.contentPreview}</p>}{event.action === "retrieved" && <small className="pv-muted">{event.contextItems} recuerdos · aprox. {event.contextTokensEstimate} tokens</small>}<div className="pv-actions"><small className="pv-muted">{new Date(event.createdAt).toLocaleString()}</small>{event.undoAvailable && <button disabled={busy} onClick={() => { if (window.confirm("¿Deshacer este cambio automático? Si editaste el recuerdo después, no se tocará.")) void mutate(() => memoryService.undo(event.id)); }}>Deshacer</button>}</div></article>)}
      </div></details>}
    </>}
    {draft && <form className="pv-memory-card pv-form" onSubmit={event => { event.preventDefault(); void mutate(async () => {
      const content = draft.content.trim();
      const embedding = draft.sensitive ? null : await aiInferenceService.embedText(content);
      await memoryService.save({ ...draft, content, embedding }, editing);
    }); }}>
      <h3>{editing ? "Editar recuerdo" : "Nuevo recuerdo"}</h3>
      <label>Contenido<textarea autoFocus required maxLength={4000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></label>
      <label className="pv-check"><input type="checkbox" checked={Boolean(draft.sensitive)} onChange={event => setDraft({ ...draft, sensitive: event.target.checked, scope: event.target.checked ? "private" : draft.scope, groupId: event.target.checked ? null : draft.groupId, approved: true })} /> Contiene información sensible; guardar cifrada</label>
      {draft.sensitive && <p className="pv-memory-notice">Solo queda visible en tu cuenta. No se indexa ni se comparte con DeepSeek. Requiere consentimiento y MEMORY_ENCRYPTION_KEY en el servidor.</p>}
      <label>Compartir con<select value={draft.sensitive ? "private" : draft.scope} disabled={Boolean(draft.sensitive)} onChange={event => setDraft({ ...draft, scope: event.target.value as MemoryScope, groupId: null })}>{Object.entries(scopeLabel).map(([value, label]) => <option value={value} key={value} disabled={value !== "private" && !preferences.sharedConsent}>{label}</option>)}</select></label>
      {draft.scope === "group" && !draft.sensitive && <label>Grupo<select required value={draft.groupId ?? ""} onChange={event => setDraft({ ...draft, groupId: Number(event.target.value) })}><option value="">Elige un grupo</option>{groups.filter(group => group.characterIds.includes(draft.characterId)).map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>}
      <p className="pv-muted">{draft.sensitive || draft.scope === "private" ? "Solo este personaje podrá usarlo." : draft.scope === "group" ? "Solo los miembros del grupo podrán acceder." : "Todos tus personajes podrán acceder con permiso de compartir activado."}</p>
      <div className="pv-actions"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button className="pv-primary" disabled={busy || !draft.content.trim() || (draft.scope === "group" && !draft.groupId)}>Guardar {draft.approved ? "recuerdo" : "sugerencia"}</button></div>
    </form>}
    {groupDraft && <form className="pv-memory-card pv-form" onSubmit={event => { event.preventDefault(); void mutate(() => memoryService.saveGroup(groupDraft, groupId)); }}>
      <h3>{groupId ? "Editar grupo" : "Crear grupo"}</h3>
      <label>Nombre del grupo<input autoFocus required maxLength={100} value={groupDraft.name} onChange={event => setGroupDraft({ ...groupDraft, name: event.target.value })} /></label>
      <fieldset><legend>Personajes miembros</legend>{profiles.map(profile => <label className="pv-check" key={profile.id}><input type="checkbox" checked={groupDraft.characterIds.includes(Number(profile.id))} onChange={event => setGroupDraft({ ...groupDraft, characterIds: event.target.checked ? [...groupDraft.characterIds, Number(profile.id)] : groupDraft.characterIds.filter(id => id !== Number(profile.id)) })} />{profile.name}</label>)}</fieldset>
      <label>Instrucciones compartidas (opcional)<textarea maxLength={8000} value={groupDraft.personalityInstructions || ""} onChange={event => setGroupDraft({ ...groupDraft, personalityInstructions: event.target.value || null })} /></label><p className="pv-muted">Las instrucciones individuales de cada personaje tienen prioridad.</p>
      <div className="pv-actions"><button type="button" disabled={busy} onClick={() => setGroupDraft(null)}>Cancelar</button><button className="pv-primary" disabled={busy || !groupDraft.name.trim()}>Guardar grupo</button></div>
    </form>}
  </section>;
}
