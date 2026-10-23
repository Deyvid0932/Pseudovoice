import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VoiceProfile } from "../types/voice";
import { rulesService, type CharacterRuleResponseDto, type RulesCatalogResponseDto } from "../services/rulesService";
import type { CatalogVoice } from "../services/aiInferenceService";

interface Props {
  profile: VoiceProfile;
  userId: number;
  onClose: () => void;
  onUpdate: (profile: VoiceProfile, name: string, avatar: string | null, voice?: CatalogVoice, personalityPrompt?: string | null) => Promise<void>;
}

export function RulesPersonalityDialog({ profile, userId, onClose, onUpdate }: Props) {
  const characterId = Number(profile.id);
  const [prompt, setPrompt] = useState(profile.personalityPrompt ?? "");
  const [confirmedPrompt, setConfirmedPrompt] = useState(profile.personalityPrompt ?? "");
  const [catalog, setCatalog] = useState<RulesCatalogResponseDto[]>([]);
  const [assignments, setAssignments] = useState<CharacterRuleResponseDto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveReport, setSaveReport] = useState("");
  const [loaded, setLoaded] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [current, globalRules, userRules] = await Promise.all([rulesService.getCharacterRules(characterId), rulesService.getGlobalRules(), rulesService.getUserRules(userId)]);
      const available = [...new Map([...globalRules, ...userRules].map(rule => [rule.id, rule])).values()];
      setAssignments(current);
      setSelected(new Set(current.map(item => item.ruleId)));
      setCatalog(available);
      setLoaded(true);
      setError("");
    } catch (reason) {
      setError(`No se pudieron cargar las reglas: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally { setLoading(false); }
  }, [characterId, userId]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    promptRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const hasChanges = prompt !== confirmedPrompt || assignments.some(item => !selectedIds.has(item.ruleId)) || [...selectedIds].some(id => !assignments.some(item => item.ruleId === id));

  function close() {
    if (hasChanges && !window.confirm("Hay cambios sin guardar. ¿Descartarlos y cerrar?")) return;
    onClose();
  }

  async function save() {
    if (!loaded || prompt.length > 2000 || saving || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(""); setSaveReport("");
    const completed: string[] = [];
    const failed: string[] = [];
    let current = [...assignments];

    try {
      current = await rulesService.getCharacterRules(characterId);
      setAssignments(current);
    } catch (reason) {
      setSaveReport(`No se pudo verificar el estado actual de las reglas (${reason instanceof Error ? reason.message : String(reason)}). No se modificó ninguna regla; tus cambios siguen en el editor.`);
      savingRef.current = false;
      setSaving(false);
      return;
    }

    if (prompt !== confirmedPrompt) {
      try {
        // This dialog edits only personality. Do not resend the catalog image URL
        // as avatarUrl: the API avatar field accepts only user-uploaded JPEG data.
        await onUpdate(profile, profile.name, null, undefined, prompt);
        setConfirmedPrompt(prompt);
        completed.push("personalidad");
      } catch (reason) {
        failed.push(`personalidad (${reason instanceof Error ? reason.message : String(reason)})`);
      }
    }

    for (const assignment of current.filter(item => !selectedIds.has(item.ruleId))) {
      try {
        await rulesService.unassignRule(assignment.id);
        current = current.filter(item => item.id !== assignment.id);
        setAssignments(current);
        completed.push(catalog.find(item => item.id === assignment.ruleId)?.ruleCode ?? "una regla");
      } catch (reason) {
        failed.push(`${catalog.find(item => item.id === assignment.ruleId)?.ruleCode ?? "una regla"} (${reason instanceof Error ? reason.message : String(reason)})`);
      }
    }

    for (const ruleId of selectedIds) {
      if (current.some(item => item.ruleId === ruleId)) continue;
      try {
        const created = await rulesService.assignRule(characterId, { ruleId, priority: 5 });
        current = [...current, created];
        setAssignments(current);
        completed.push(catalog.find(item => item.id === ruleId)?.ruleCode ?? "una regla");
      } catch (reason) {
        failed.push(`${catalog.find(item => item.id === ruleId)?.ruleCode ?? "una regla"} (${reason instanceof Error ? reason.message : String(reason)})`);
      }
    }

    setSaving(false);
    savingRef.current = false;
    if (failed.length) {
      setSaveReport(`${completed.length ? `Completado: ${completed.join(", ")}. ` : ""}Pendiente: ${failed.join("; ")}. Tus cambios siguen en el editor.`);
      return;
    }
    onClose();
  }

  return <div className="pv-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="pv-dialog pv-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="pv-rules-title" onKeyDown={event => { if (event.key === "Escape") close(); if (event.key === "Tab") { const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]; const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}>
      <header className="pv-rules-heading"><div><p className="pv-eyebrow">Personalidad del personaje</p><h2 id="pv-rules-title">Reglas de {profile.name}</h2><p>Define el prompt base y las reglas que se aplican en sus conversaciones.</p></div><button type="button" aria-label="Cerrar" onClick={close}>×</button></header>
      <div className="pv-rules-scroll">
        <section className="pv-rules-card"><div><strong>Prompt base</strong><p>Instrucciones principales de personalidad y comportamiento.</p></div><textarea ref={promptRef} aria-label="Prompt base del personaje" rows={8} maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={`Describe quién es ${profile.name}, cómo piensa y cómo conversa…`} />
          <div className="pv-personality-meta"><span className={prompt.length > 2000 ? "pv-over-limit" : ""}>{prompt.length.toLocaleString()} / 2.000 caracteres</span><button type="button" disabled={!prompt || saving} onClick={() => setPrompt("")}>Borrar prompt</button></div>
          {profile.personalityPrompt && profile.personalityPrompt.length > 2000 && prompt === confirmedPrompt && <p className="pv-muted">Este prompt antiguo supera el nuevo límite. Se conserva completo; reduce su longitud antes de guardarlo.</p>}
        </section>
        <section className="pv-rules-card"><div><strong>Reglas específicas</strong><p>Elige reglas disponibles para {profile.name}. Los límites de seguridad del sistema prevalecen.</p></div>
          {loading ? <p className="pv-muted">Cargando reglas…</p> : error && !loaded ? <div role="alert" className="pv-inline-error"><span>{error}</span><button type="button" onClick={() => void loadRules()}>Reintentar</button></div> : catalog.length ? <div className="pv-rule-options">{catalog.map(rule => <label key={rule.id} className="pv-rule-option"><input type="checkbox" checked={selectedIds.has(rule.id)} disabled={saving} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(rule.id); else next.delete(rule.id); return next; })} /><span><strong>{rule.ruleCode.replace(/_/g, " ")}</strong><small>{rule.promptDescription}</small><em>{rule.category}</em></span></label>)}</div> : <p className="pv-muted">No hay reglas adicionales disponibles. El prompt base seguirá funcionando.</p>}
        </section>
        {saveReport && <p className="pv-save-report" role="alert">{saveReport}</p>}
        {error && loaded && <p className="pv-inline-error" role="alert">{error}</p>}
      </div>
      <footer className="pv-rules-footer"><button type="button" disabled={saving} onClick={close}>Cancelar</button><button className="pv-primary" type="button" disabled={!hasChanges || loading || saving || prompt.length > 2000} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer>
    </section>
  </div>;
}
