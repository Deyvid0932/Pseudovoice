import type { SuiteView } from "../types/voice";
import type { Theme } from "../lib/preferences";
import { cn } from "../lib/format";
import { Avatar } from "./ui/Avatar";
import {
  AudioLinesIcon,
  ClockIcon,
  GearIcon,
  HeadphonesIcon,
} from "./ui/icons";

interface SuiteNavItem {
  id: SuiteView;
  label: string;
  Icon: typeof HeadphonesIcon;
}

export const SUITE_NAV: SuiteNavItem[] = [
  { id: "focus", label: "Conversación", Icon: HeadphonesIcon },
  { id: "logs", label: "Historial", Icon: ClockIcon },
];

export interface TopBarProps {
  activeView: SuiteView;
  onNavigate: (view: SuiteView) => void;
  connected: boolean;
  onOpenSettings: () => void;
  userName?: string;
  userEmail?: string;
  userAvatarUrl?: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

export function TopBar({
  activeView,
  onNavigate,
  connected,
  onOpenSettings,
  userName = "Perfil local",
  userEmail,
  userAvatarUrl,
  theme,
  onToggleTheme,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
      <div className="pv-topbar-inner mx-auto flex h-16 w-full max-w-[1720px] items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-teal-500/40 bg-teal-500/10 text-teal-300 shadow-[0_0_18px_-2px_rgba(45,212,191,0.55)]">
            <AudioLinesIcon size={17} strokeWidth={2} />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight text-zinc-100">
              Pseudo
            </span>
            <span className="text-lg font-bold tracking-tight text-teal-400">
              Voice
            </span>
          </span>
          <span className="pv-kicker hidden text-zinc-600 sm:inline-flex">
            Desktop Suite
          </span>
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-1 md:gap-2"
        >
          {SUITE_NAV.map((item) => {
            const isActive = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-md px-3 py-4 text-xs font-semibold tracking-wide transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                  isActive
                    ? "text-teal-300"
                    : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                <item.Icon size={16} />
                <span className="hidden uppercase sm:inline">{item.label}</span>
                {isActive ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal-400 shadow-[0_0_12px_2px_rgba(45,212,191,0.6)]" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex",
              connected
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/40 bg-amber-500/10",
            )}
          >
            <span className="relative flex h-2 w-2">
              {connected ? (
                <span className="animate-pv-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  connected ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
            </span>
            <span
              className={cn(
                "pv-kicker",
                connected ? "text-emerald-300" : "text-amber-300",
              )}
            >
              {connected ? "Conectado" : "Sin conexión"}
            </span>
          </span>

          <div className="hidden items-center gap-2 border-l border-zinc-800 pl-3 sm:flex" title={[userName, userEmail].filter(Boolean).join("\n")}>
            <Avatar seed={`user-${userName}`} label={userName} imageUrl={userAvatarUrl} size={30} roundedClassName="rounded-full" />
            <span className="max-w-28 truncate text-xs text-zinc-400">{userName}</span>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded-lg border border-transparent px-2.5 py-2 text-xs text-zinc-500 transition hover:border-zinc-800 hover:bg-zinc-900 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            Salir
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            className="pv-theme-toggle rounded-lg border border-transparent p-2 text-zinc-500 transition-all duration-200 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            {theme === "dark" ? "☼" : "☾"}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Abrir configuración"
            className="rounded-lg border border-transparent p-2 text-zinc-500 transition-all duration-200 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-95"
          >
            <GearIcon size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
