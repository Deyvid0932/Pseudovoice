import { useCallback, useEffect, useRef, useState } from "react";
import { agentService, type AgentApproval, type AgentStep, type AgentTask } from "../services/agentService";
import { aiInferenceService } from "../services/aiInferenceService";
import { BoltIcon, CheckIcon, XIcon } from "./ui/icons";

const statusLabel: Record<AgentTask["status"], string> = {
  queued: "En cola", running: "En curso", awaiting_approval: "Esperando autorización", completed: "Completada",
  failed: "Falló", interrupted: "Interrumpida", cancelled: "Detenida", uncertain: "Revisión necesaria",
};

export function AgentTaskTray({ onRestart }: { onRestart: (task: AgentTask) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const lastStatuses = useRef(new Map<number, AgentTask["status"]>());
  const dialog = useRef<HTMLElement>(null);
  const pendingCount = approvals.length + tasks.filter(task => task.status === "interrupted" || task.status === "uncertain").length;

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextApprovals] = await Promise.all([agentService.tasks(40), agentService.pendingApprovals()]);
      for (const task of nextTasks) {
        const previous = lastStatuses.current.get(task.id);
        if (previous !== task.status && ["completed", "failed", "interrupted", "uncertain"].includes(task.status)) {
          window.dispatchEvent(new CustomEvent("pseudovoice:agent-task-updated", { detail: task }));
        }
        lastStatuses.current.set(task.id, task.status);
      }
      setTasks(nextTasks);
      setApprovals(nextApprovals);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setInitialLoading(false); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focus = dialog.current?.querySelector<HTMLButtonElement>("button");
    focus?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  async function showSteps(taskId: number) {
    setSelected(taskId);
    try { setSteps(await agentService.steps(taskId)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function approvalAction(item: AgentApproval, approve: boolean) {
    setBusyId(item.taskId); setError("");
    try {
      if (approve) await agentService.approve(item.taskId, item.id);
      else await agentService.reject(item.taskId, item.id);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyId(null); }
  }

  async function stopTask(task: AgentTask) {
    setBusyId(task.id); setError("");
    try { await aiInferenceService.cancelAgentTask(task.id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyId(null); }
  }

  async function restartTask(task: AgentTask) {
    const warning = task.status === "uncertain"
      ? "El resultado de una acción anterior no se pudo verificar. Volver a iniciar puede duplicar sus efectos. Revisa primero los pasos. ¿Quieres crear una ejecución nueva?"
      : "Se iniciará una ejecución nueva desde el principio; los pasos anteriores no se repetirán automáticamente, pero el agente podría volver a proponerlos. ¿Continuar?";
    if (!window.confirm(warning)) return;
    setBusyId(task.id); setError("");
    try { await onRestart(task); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyId(null); }
  }

  return <div className="pv-agent-tray-root">
    <button type="button" className="pv-agent-tray-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
      <BoltIcon size={16} /><span>Tareas</span>{pendingCount > 0 && <b aria-label={`${pendingCount} pendientes`}>{pendingCount > 9 ? "9+" : pendingCount}</b>}
    </button>
    {open && <div className="pv-agent-tray-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} className="pv-agent-tray-panel" role="dialog" aria-modal="true" aria-labelledby="pv-agent-tray-title">
        <header><div><span className="pv-agent-tray-icon"><BoltIcon size={18} /></span><div><h2 id="pv-agent-tray-title">Tareas y autorizaciones</h2><p>Vista global · independiente del personaje activo</p></div></div><button type="button" aria-label="Cerrar bandeja" onClick={() => setOpen(false)}><XIcon size={18} /></button></header>
        {error && <p className="pv-error" role="alert">{error}</p>}
        <div className="pv-agent-tray-content" aria-busy={initialLoading}>
          {approvals.length > 0 && <section className="pv-agent-tray-section"><h3>Autorizaciones pendientes <span>{approvals.length}</span></h3>{approvals.map(item => {
            let payload = item.payloadJson;
            try { payload = JSON.stringify(JSON.parse(payload), null, 2); } catch { /* Preserve the server-provided preview. */ }
            return <article className="pv-agent-approval-card" key={item.id}>
              <div className="pv-agent-approval-meta"><strong>{item.characterName}</strong><span>{item.actionLabel}</span></div>
              <p>{item.destination || "Destino no especificado"}</p>
              <pre>{payload.slice(0, 1800)}{payload.length > 1800 ? "…" : ""}</pre>
              <small>Vence {new Date(item.expiresAt).toLocaleTimeString()}</small>
              <div><button type="button" className="pv-agent-approve" disabled={busyId === item.taskId} onClick={() => void approvalAction(item, true)}><CheckIcon size={15} />Aprobar esta acción</button><button type="button" disabled={busyId === item.taskId} onClick={() => void approvalAction(item, false)}>Rechazar</button></div>
            </article>;
          })}</section>}
          <section className="pv-agent-tray-section"><h3>Historial técnico <span>7 días</span></h3>
            {initialLoading && <p className="pv-agent-loading" role="status">Cargando tareas y autorizaciones…</p>}
            {tasks.length === 0 && !initialLoading && <p className="pv-agent-empty">Todavía no hay tareas. Activa Modo agente en Configuración para comenzar.</p>}
            {tasks.map(task => <article className={`pv-agent-task-card is-${task.status}`} key={task.id}>
              <button type="button" className="pv-agent-task-summary" onClick={() => void showSteps(task.id)} aria-expanded={selected === task.id}>
                <span><strong>{task.characterName} · {task.title}</strong><small>{new Date(task.createdAt).toLocaleString()} · {task.stepCount} pasos</small></span>
                <span className="pv-agent-task-status">{statusLabel[task.status]}</span>
              </button>
              {task.summary && <p className="pv-agent-task-result">{task.summary}</p>}
              <p className="pv-agent-task-cost">DeepSeek ${Number(task.deepseekCostUsd).toFixed(4)} · Fish ${Number(task.fishCostUsd).toFixed(4)} · {task.inputTokens + task.outputTokens} tokens</p>
              {selected === task.id && <div className="pv-agent-task-steps">
                {steps.map(step => <div className={`pv-agent-step is-${step.status}`} key={step.id}><span>{step.sequence}. {step.toolName}</span><small>{step.targetOrigin || step.status}</small>{step.summary && <p>{step.summary}</p>}</div>)}
                {steps.some(step => step.status === "uncertain") && <p className="pv-agent-uncertain-warning" role="alert">Alguna acción pudo tener efecto. Verifícala antes de iniciar otra ejecución; no se reintentará automáticamente.</p>}
                {task.status === "running" || task.status === "queued" || task.status === "awaiting_approval" ? <button type="button" className="pv-agent-stop" disabled={busyId === task.id} onClick={() => void stopTask(task)}>Detener tarea</button> : null}
                {["interrupted", "uncertain", "failed"].includes(task.status) && <button type="button" className="pv-agent-restart" disabled={busyId === task.id} onClick={() => void restartTask(task)}>Revisé los pasos · iniciar una tarea nueva</button>}
              </div>}
            </article>)}
          </section>
        </div>
      </section>
    </div>}
  </div>;
}
