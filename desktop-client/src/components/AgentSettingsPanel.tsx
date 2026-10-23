import { useEffect, useState } from "react";
import { agentService, type AgentPreferences } from "../services/agentService";
import { tauriBridge } from "../services/tauriBridge";

type ToggleKey = "enabled" | "allowPublicNavigation" | "allowAuthenticatedNavigation" | "allowRead" | "allowFormFill" | "allowDownloads" | "allowUploads" | "allowModifications";

const options: Array<{ key: ToggleKey; title: string; detail: string }> = [
  { key: "enabled", title: "Habilitar Modo agente", detail: "Permite iniciar tareas web desde el compositor. Desactivado de forma predeterminada." },
  { key: "allowPublicNavigation", title: "Navegar por páginas públicas", detail: "El destino se muestra en la solicitud de autorización antes de cambiar de página." },
  { key: "allowAuthenticatedNavigation", title: "Usar páginas con sesión iniciada", detail: "Úsalo solo en sitios y cuentas que autorizaste. La navegación requiere aprobación." },
  { key: "allowRead", title: "Leer contenido de páginas", detail: "Las lecturas usan snapshots estructurados; el texto web nunca puede cambiar las políticas del agente." },
  { key: "allowFormFill", title: "Escribir en formularios", detail: "Cada escritura requiere autorización; se bloquean campos de contraseñas, pagos y secretos." },
  { key: "allowDownloads", title: "Permitir descargas", detail: "La ejecución solo estará disponible cuando el MCP conectado exponga una herramienta compatible." },
  { key: "allowUploads", title: "Permitir subir archivos", detail: "Cada carga requiere aprobación explícita y revisión del destino." },
  { key: "allowModifications", title: "Permitir acciones que modifican páginas", detail: "Cada clic o cambio de estado requiere autorización ligada a esa acción exacta." },
];

export function AgentSettingsPanel({ pcControlEnabled, onPcControlChange }: { pcControlEnabled: boolean; onPcControlChange: (enabled: boolean) => Promise<void> }) {
  const [value, setValue] = useState<AgentPreferences>(agentService.defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pcBusy, setPcBusy] = useState(false);
  const [originsDraft, setOriginsDraft] = useState("");
  const native = tauriBridge.isTauri();

  useEffect(() => {
    let active = true;
    agentService.preferences().then(result => { if (active) { setValue({ ...agentService.defaults, ...result }); setOriginsDraft((result.publicNavigationOrigins ?? []).join("\n")); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(next: AgentPreferences) {
    setValue(next); setBusy(true); setError(""); setSaved(false);
    try { const savedValue = await agentService.savePreferences(next); setValue(savedValue); setOriginsDraft(savedValue.publicNavigationOrigins.join("\n")); setSaved(true); window.dispatchEvent(new CustomEvent("pseudovoice:agent-preferences-updated", { detail: savedValue })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (loading) return <p className="pv-agent-loading" role="status">Cargando permisos guardados…</p>;
  return <div className="pv-agent-settings">
    <section className="pv-agent-settings-card">
      <div className="pv-agent-settings-heading"><div><h4>Control local de Windows</h4><p>Comandos nativos limitados disponibles únicamente en Tauri; independiente de la automatización web.</p></div><span className={`pv-agent-state${pcControlEnabled ? " is-on" : ""}`}>{native ? (pcControlEnabled ? "Habilitado" : "Desactivado") : "Solo escritorio"}</span></div>
      <label className="pv-agent-setting-row"><span><strong>Permitir comandos del PC</strong><small>Abre o controla únicamente aplicaciones incluidas en la lista segura de Tauri; abrir/cerrar requiere confirmación.</small></span><input type="checkbox" role="switch" checked={pcControlEnabled} disabled={!native || pcBusy} onChange={async event => { setPcBusy(true); setError(""); try { await onPcControlChange(event.target.checked); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setPcBusy(false); } }} /></label>
    </section>
    <section className="pv-agent-settings-card">
      <div className="pv-agent-settings-heading"><div><h4>General</h4><p>El motor es compartido; cada tarea conserva su personaje y conversación.</p></div><span className={`pv-agent-state${value.enabled ? " is-on" : ""}`}>{value.enabled ? "Habilitado" : "Desactivado"}</span></div>
      <div className="pv-agent-toggle-list">{options.map(option => <label className="pv-agent-setting-row" key={option.key}>
        <span><strong>{option.title}</strong><small>{option.detail}</small></span>
        <input type="checkbox" role="switch" checked={value[option.key]} disabled={busy} onChange={event => void save({ ...value, [option.key]: event.target.checked })} />
      </label>)}</div>
      <label className="pv-agent-setting-row pv-agent-budget-row"><span><strong>Máximo de pasos por tarea</strong><small>El límite de seguridad absoluto es 15.</small></span><input type="number" min={1} max={15} value={value.maxSteps} disabled={busy} onChange={event => setValue(current => ({ ...current, maxSteps: Math.max(1, Math.min(15, Number(event.target.value) || 1)) }))} /><button type="button" disabled={busy} onClick={() => void save(value)}>Guardar</button></label>
    </section>

    <section className="pv-agent-settings-card">
      <div className="pv-agent-settings-heading"><div><h4>Navegación sin confirmación</h4><p>Solo para abrir y leer sitios HTTPS de tu lista. Los clics, formularios, cargas y cambios siguen requiriendo autorización.</p></div></div>
      <label className="pv-agent-setting-row"><span><strong>Permitir navegación pública sin preguntar</strong><small>Desactivado por defecto. Guarda la lista para activarlo; desactivarlo se guarda inmediatamente. Las páginas con sesión iniciada conservan la confirmación.</small></span><input type="checkbox" role="switch" checked={value.autoApprovePublicNavigation} disabled={busy} onChange={event => { if (event.target.checked) setValue(current => ({ ...current, autoApprovePublicNavigation: true })); else void save({ ...value, autoApprovePublicNavigation: false }); }} /></label>
      <label className="pv-form">Sitios permitidos, uno por línea<textarea rows={3} maxLength={5000} value={originsDraft} disabled={busy} placeholder="https://www.google.com" onChange={event => setOriginsDraft(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void save({ ...value, publicNavigationOrigins: originsDraft.split(/\r?\n/).map(origin => origin.trim()).filter(Boolean) })}>Guardar navegación</button>
    </section>
    <section className="pv-agent-settings-card">
      <div className="pv-agent-settings-heading"><div><h4>Presupuesto por tarea</h4><p>Los costos de DeepSeek y Fish Audio se muestran por separado.</p></div></div>
      <div className="pv-agent-budget-grid">
        <label><span>Límite DeepSeek (USD)</span><input type="number" min="0" max="10" step="0.01" value={value.deepseekBudgetUsd} disabled={busy} onChange={event => setValue(current => ({ ...current, deepseekBudgetUsd: Math.max(0, Math.min(10, Number(event.target.value) || 0)) }))} /></label>
        <label><span>Límite Fish Audio (USD)</span><input type="number" min="0" max="10" step="0.01" value={value.fishBudgetUsd} disabled={busy} onChange={event => setValue(current => ({ ...current, fishBudgetUsd: Math.max(0, Math.min(10, Number(event.target.value) || 0)) }))} /></label>
      </div>
      <button className="pv-agent-save-budget" type="button" disabled={busy} onClick={() => void save(value)}>{busy ? "Guardando…" : "Guardar límites"}</button>
      <p className="pv-agent-note">La tarea se pausa al alcanzar el límite calculado. Para aplicar el control de gasto, configura las tarifas de entrada y salida de DeepSeek en el .env del motor; los totales del proveedor pueden variar.</p>
      <p className="pv-agent-note">El resultado se reproduce con la voz del personaje si el límite Fish Audio cubre la síntesis. Para estimarlo, configura FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES en el .env. Con límite cero, el resultado queda por escrito.</p>
    </section>

    <section className="pv-agent-settings-card pv-agent-whatsapp-disabled">
      <div className="pv-agent-settings-heading"><div><h4>WhatsApp y audio</h4><p>La preparación y el envío todavía no están implementados. No se habilita ningún envío.</p></div><span className="pv-agent-state">Próxima fase</span></div>
      <p>Cuando se integre, cada mensaje o audio exigirá aprobación explícita. Los permisos temporales no aprobarán envíos automáticamente y tendrán un máximo de una hora.</p>
    </section>
    {error && <p className="pv-error" role="alert">No se guardaron los ajustes: {error}. Los valores editados siguen visibles; puedes reintentar.</p>}
    {saved && !busy && <p className="pv-agent-saved" role="status">Preferencias guardadas para tu cuenta.</p>}
  </div>;
}
