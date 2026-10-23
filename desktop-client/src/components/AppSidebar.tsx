import { useEffect, useMemo, useRef, useState } from "react";
import type { SuiteView, VoiceProfile, ConversationSummary } from "../types/voice";
import type { SettingsSection } from "./SettingsHub";
import type { UserProfile } from "../services/userService";
import { readPreference, savePreference } from "../lib/preferences";
import { Avatar } from "./ui/Avatar";
import { VoiceMarkIcon } from "./ui/icons";
import { ConversationActionsMenu } from "./history/ConversationActionsMenu";

interface Props {
  profiles: VoiceProfile[];
  conversations: ConversationSummary[];
  previews: Record<number, string>;
  selectedConversationId: number | null;
  user: UserProfile | null;
  fallbackUser: { fullName: string; email: string; avatarUrl: string | null };
  view: SuiteView;
  onNavigate: (view: SuiteView) => void;
  onSelectCharacter: (profile: VoiceProfile) => void;
  onOpenConversation: (conversationId: number) => void;
  onRenameConversation: (conversationId: number, title: string) => Promise<void>;
  onDeleteConversation: (conversationId: number) => Promise<void>;
  busy: boolean;
  onNewConversation: () => void;
  onExploreVoices: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onSignOut: () => void;
}

export function AppSidebar(props: Props) {
  const {
    profiles, conversations, previews, selectedConversationId, user, fallbackUser,
    view, onNavigate, onSelectCharacter, onOpenConversation,
    onNewConversation, onExploreVoices, onOpenSettings, onSignOut,
    onRenameConversation, onDeleteConversation, busy,
  } = props;
  const [collapsed, setCollapsed] = useState(() => readPreference("sidebar-collapsed", "false") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedCharacters, setExpandedCharacters] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const characterNavRef = useRef<HTMLElement>(null);
  const characterRowsRef = useRef(new Map<string, HTMLElement>());
  const identity = user ?? fallbackUser;
  const activeCharacterId = profiles.find(profile => profile.status === "in_use")?.id ?? null;
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return { profiles, conversations };
    return {
      profiles: profiles.filter(profile => profile.name.toLocaleLowerCase().includes(term) || conversations.some(chat => chat.characterId === Number(profile.id) && `${chat.title} ${previews[chat.id] ?? ""}`.toLocaleLowerCase().includes(term))),
      conversations: conversations.filter(chat => `${chat.title} ${chat.characterName} ${previews[chat.id] ?? ""}`.toLocaleLowerCase().includes(term)),
    };
  }, [profiles, conversations, previews, query]);

  useEffect(() => {
    if (!profileMenu) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileMenu(false); };
    const onPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setProfileMenu(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onPointer); };
  }, [profileMenu]);

  useEffect(() => {
    if (!collapsed || !activeCharacterId) return;
    const nav = characterNavRef.current;
    const row = characterRowsRef.current.get(activeCharacterId);
    if (!nav || !row) return;
    const navRect = nav.getBoundingClientRect();
    const rowTop = row.getBoundingClientRect().top - navRect.top + nav.scrollTop;
    const margin = Math.min(18, nav.clientHeight * 0.1);
    const target = rowTop - nav.clientHeight + row.offsetHeight + margin;
    nav.scrollTo({
      top: Math.max(0, Math.min(target, nav.scrollHeight - nav.clientHeight)),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [activeCharacterId, collapsed]);

  const chooseCharacter = (profile: VoiceProfile) => {
    onSelectCharacter(profile);
    setMobileOpen(false);
  };

  return <>
    <button className="pv-mobile-sidebar-toggle" type="button" aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? "×" : "☰"}</button>
    {mobileOpen && <button className="pv-sidebar-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <aside className={`pv-app-sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`} aria-label="Navegación y personajes">
      <div className="pv-sidebar-brand"><span className="pv-brand-mark"><VoiceMarkIcon size={20} /></span>{!collapsed && <span>Pseudo<span>Voice</span></span>}<button type="button" className="pv-sidebar-collapse" aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => { const next = !value; savePreference("sidebar-collapsed", String(next)); return next; })}>{collapsed ? "›" : "‹"}</button></div>
      <button className="pv-new-conversation" type="button" aria-label="Nueva conversación" disabled={!profiles.some(profile => profile.status === "in_use")} onClick={() => { onNewConversation(); setMobileOpen(false); }} title="Iniciar otro chat con el personaje activo">＋ {!collapsed && "Nueva conversación"}</button>
      {!collapsed && <label className="pv-sidebar-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar conversaciones…" aria-label="Buscar conversaciones" /></label>}
      <nav ref={characterNavRef} className="pv-character-nav" aria-label="Personajes y conversaciones">
        {filtered.profiles.map(profile => {
          const chats = filtered.conversations.filter(chat => chat.characterId === Number(profile.id));
          const expanded = expandedCharacters[profile.id] ?? Boolean(query);
          return <details ref={node => { if (node) characterRowsRef.current.set(profile.id, node); else characterRowsRef.current.delete(profile.id); }} data-character-id={profile.id} className="pv-sidebar-character" key={profile.id} open={!collapsed && expanded}>
            <summary aria-label={`${profile.name}, ${chats.length} conversaciones`}>
              <button type="button" className={`pv-sidebar-character-select${profile.id === profiles.find(item => item.status === "in_use")?.id ? " is-active" : ""}`} aria-pressed={profile.id === profiles.find(item => item.status === "in_use")?.id} aria-expanded={!collapsed && expanded} aria-controls={!collapsed ? `character-chats-${profile.id}` : undefined} title={profile.name} onClick={event => {
                event.preventDefault();
                if (collapsed) { chooseCharacter(profile); return; }
                setExpandedCharacters(current => ({ ...current, [profile.id]: !expanded }));
                onSelectCharacter(profile);
              }}>
                <Avatar seed={profile.avatarSeed} label={profile.name} imageUrl={profile.avatarUrl || profile.sourceAvatarUrl} palette={profile.palette} size={38} roundedClassName="rounded-full" decorative />
                {!collapsed && <span><strong>{profile.name}</strong><small>{profile.sourceName || profile.archetype}</small></span>}
              </button>
            </summary>
            {!collapsed && <div className="pv-sidebar-chats" id={`character-chats-${profile.id}`}>{chats.map(chat => <div className={`pv-sidebar-chat${chat.id === selectedConversationId ? " is-active" : ""}`} key={chat.id}>
              <button type="button" className="pv-sidebar-chat-open" onClick={() => { onOpenConversation(chat.id); setMobileOpen(false); }} title={`${chat.title} · ${profile.name}`}><span aria-hidden="true">◌</span><span><strong>{chat.title}</strong><small>{previews[chat.id] || "Abrir conversación"}</small></span></button>
              <ConversationActionsMenu conversation={chat} disabled={busy} onRename={onRenameConversation} onDelete={onDeleteConversation} />
            </div>)}{!chats.length && <p>{query ? "Sin chats coincidentes" : "Sin conversaciones"}</p>}</div>}
          </details>;
        })}
      {!profiles.length && <p className="pv-sidebar-empty">Crea un personaje desde la biblioteca Fish.</p>}
      </nav>
      <button type="button" className="pv-sidebar-history" aria-label="Explorar voces" title="Explorar voces" onClick={() => { onExploreVoices(); window.dispatchEvent(new CustomEvent("pseudovoice:open-voice-library")); setMobileOpen(false); }}>＋ {!collapsed && <span>Explorar voces</span>}</button>
      <button className={`pv-sidebar-history${view === "logs" ? " is-active" : ""}`} type="button" aria-label="Historial" title="Historial" onClick={() => { onNavigate("logs"); setMobileOpen(false); }}>◷ {!collapsed && <span>Historial</span>}</button>
      <div className="pv-sidebar-account" ref={menuRef}>
        {profileMenu && <div className="pv-account-menu" role="menu" aria-label="Menú de perfil">
          <div className="pv-account-menu-identity"><Avatar seed={`user-${identity.fullName}`} label={identity.fullName} imageUrl={identity.avatarUrl} size={38} roundedClassName="rounded-full" /><span><strong>{identity.fullName}</strong><small>{identity.email}</small></span></div>
          <button role="menuitem" onClick={() => { onOpenSettings("profile"); setProfileMenu(false); }}>Perfil</button>
          <button role="menuitem" onClick={() => { onOpenSettings("personalization"); setProfileMenu(false); }}>Personalización</button>
          <button role="menuitem" onClick={() => { onOpenSettings("desktop"); setProfileMenu(false); }}>Configuración</button>
          <button role="menuitem" className="is-signout" onClick={onSignOut}>Cerrar sesión</button>
        </div>}
        <button className="pv-profile-trigger" type="button" aria-haspopup="menu" aria-expanded={profileMenu} onClick={() => setProfileMenu(value => !value)} title={collapsed ? identity.fullName : undefined}>
          <Avatar seed={`user-${identity.fullName}`} label={identity.fullName} imageUrl={identity.avatarUrl} size={38} roundedClassName="rounded-full" />
          {!collapsed && <span><strong>{identity.fullName}</strong><small>{identity.email}</small></span>}
        </button>
      </div>
    </aside>
  </>;
}
