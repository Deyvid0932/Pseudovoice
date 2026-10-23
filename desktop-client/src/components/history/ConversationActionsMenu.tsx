import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ConversationSummary } from "../../types/voice";

interface Props {
  conversation: ConversationSummary;
  disabled?: boolean;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function ConversationActionsMenu({ conversation, disabled = false, onRename, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key); };
  }, [menuOpen]);

  useEffect(() => {
    if (editing) { setTitle(conversation.title); setError(null); inputRef.current?.focus(); }
    else if (returnFocusRef.current) { returnFocusRef.current.focus(); returnFocusRef.current = null; }
  }, [editing]);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) { setError("Escribe un título para esta conversación."); return; }
    if (clean.length > 150) { setError("El título no puede superar 150 caracteres."); return; }
    setSaving(true);
    setError(null);
    try { await onRename(conversation.id, clean); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el título. Inténtalo otra vez."); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    setMenuOpen(false);
    if (!window.confirm(`¿Eliminar “${conversation.title}” de ${conversation.characterName}? Esta acción no se puede deshacer.`)) return;
    await onDelete(conversation.id);
  };

  return <div className="pv-conversation-actions" ref={rootRef}>
    <button ref={triggerRef} type="button" className="pv-conversation-actions-trigger" disabled={disabled} aria-label={`Opciones de ${conversation.title}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>⋯</button>
    {menuOpen && <div className="pv-conversation-actions-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { returnFocusRef.current = triggerRef.current; setMenuOpen(false); setEditing(true); }}>Renombrar</button>
      <button type="button" role="menuitem" className="is-danger" onClick={() => void remove()}>Eliminar</button>
    </div>}
    {editing && <div className="pv-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditing(false); }}>
      <section className="pv-dialog pv-rename-dialog" role="dialog" aria-modal="true" aria-labelledby={`rename-title-${conversation.id}`} onKeyDown={event => {
        if (event.key === "Escape" && !saving) { setEditing(false); return; }
        if (event.key === "Tab") {
          const controls = [...(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))];
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <header><div><p className="pv-eyebrow">{conversation.characterName}</p><h2 id={`rename-title-${conversation.id}`}>Renombrar conversación</h2></div><button type="button" aria-label="Cerrar" disabled={saving} onClick={() => setEditing(false)}>×</button></header>
        <form onSubmit={event => void rename(event)}>
          <label htmlFor={`rename-input-${conversation.id}`}>Título</label>
          <input ref={inputRef} id={`rename-input-${conversation.id}`} value={title} maxLength={150} onChange={event => { setTitle(event.target.value); setError(null); }} aria-describedby={error ? `rename-count-${conversation.id} rename-error-${conversation.id}` : `rename-count-${conversation.id}`} />
          <div id={`rename-count-${conversation.id}`} className="pv-rename-count">{title.length}/150</div>
          {error && <p id={`rename-error-${conversation.id}`} className="pv-error" role="alert">{error}</p>}
          <footer><button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancelar</button><button type="submit" className="pv-primary" disabled={saving || !title.trim()}>{saving ? "Guardando…" : "Guardar título"}</button></footer>
        </form>
      </section>
    </div>}
  </div>;
}
