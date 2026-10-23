import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { Theme } from "../lib/preferences";
import { VoiceMarkIcon } from "./ui/icons";
import { tauriBridge } from "../services/tauriBridge";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
const GOOGLE_DESKTOP_CLIENT_ID = (import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID as string | undefined)?.trim();
const GIS_SCRIPT_ID = "google-identity-services";

export function AuthScreen({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const buttonHost = useRef<HTMLDivElement>(null);
  const { signInWithGoogle, signInWithGoogleDesktop, loading, error } = useAuth();
  const [googleReady, setGoogleReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const isDesktop = tauriBridge.isTauri();

  useEffect(() => {
    if (isDesktop) {
      setGoogleReady(true);
      if (!GOOGLE_DESKTOP_CLIENT_ID) setSetupError("Falta VITE_GOOGLE_DESKTOP_CLIENT_ID en el .env de la raíz.");
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      setSetupError("Falta VITE_GOOGLE_CLIENT_ID en el .env de la raíz.");
      return;
    }

    let alive = true;
    const initialize = () => {
      if (!alive || !window.google?.accounts.id || !buttonHost.current) return;
      buttonHost.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        ux_mode: "popup",
        callback: (response) => {
          if (!response.credential) {
            setSetupError("Google no devolvió una credencial. Vuelve a intentarlo.");
            return;
          }
          void signInWithGoogle(response.credential).catch(() => undefined);
        },
      });
      window.google.accounts.id.renderButton(buttonHost.current, {
        type: "standard",
        theme: theme === "dark" ? "filled_black" : "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: Math.min(360, Math.max(220, buttonHost.current.clientWidth)),
        logo_alignment: "left",
      });
      buttonHost.current.dataset.googleRendered = "true";
      setGoogleReady(true);
    };

    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (window.google?.accounts.id) {
      initialize();
    } else if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      existing.addEventListener("error", () => setSetupError("No se pudo cargar Google. Revisa tu conexión e inténtalo de nuevo."), { once: true });
    } else {
      const script = document.createElement("script");
      script.id = GIS_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initialize;
      script.onerror = () => setSetupError("No se pudo cargar Google. Revisa tu conexión e inténtalo de nuevo.");
      document.head.appendChild(script);
    }

    return () => { alive = false; };
  }, [signInWithGoogle, theme, isDesktop]);

  const handleDesktopLogin = async () => {
    if (!GOOGLE_DESKTOP_CLIENT_ID) return;
    setSetupError(null);
    try {
      const authorization = await tauriBridge.googleDesktopLogin(GOOGLE_DESKTOP_CLIENT_ID);
      await signInWithGoogleDesktop(authorization);
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión con Google.");
    }
  };

  return (
    <main className="pv-auth-page relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-7 text-zinc-100 sm:px-8 sm:py-10">
      <div className="pv-auth-glow pv-auth-glow-one" aria-hidden="true" />
      <div className="pv-auth-glow pv-auth-glow-two" aria-hidden="true" />

      <div className="pv-auth-shell relative z-10 grid w-full max-w-[1040px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#0b0d11]/95 shadow-[0_32px_120px_-46px_rgba(20,184,166,0.28)] lg:min-h-[650px] lg:grid-cols-[1.02fr_0.98fr]">
        <section className="pv-auth-visual relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-12" aria-label="Presentación de PseudoVoice">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(45,212,191,0.15),transparent_44%),linear-gradient(145deg,#101b1c_0%,#0c1115_47%,#111019_100%)]" />
          <div className="pv-auth-orbit pv-auth-orbit-a" aria-hidden="true" />
          <div className="pv-auth-orbit pv-auth-orbit-b" aria-hidden="true" />

          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-teal-300/25 bg-teal-300/10 text-teal-200 shadow-[0_0_30px_-9px_rgba(45,212,191,.75)]">
              <VoiceMarkIcon />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Pseudo<span className="text-teal-300">Voice</span></span>
            <span className="ml-1 h-1 w-1 rounded-full bg-zinc-600" />
            <span className="pv-kicker !text-[9px] !tracking-[.18em] text-zinc-500">PERSONAL VOICE AI</span>
          </div>

          <div className="relative z-10 mt-5">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-teal-300/[0.06] px-3 py-1.5 text-[11px] font-medium text-teal-200/90">
              <span className="h-2 w-2 rounded-full bg-teal-300" />
              Tu espacio de voz, a tu manera
            </div>
            <h1 className="max-w-md text-[38px] font-semibold leading-[1.12] tracking-[-0.045em] text-white xl:text-[44px]">
              Una voz propia.<br />Una conversación <span className="bg-gradient-to-r from-teal-200 via-teal-300 to-cyan-300 bg-clip-text text-transparent">más natural.</span>
            </h1>
            <p className="mt-5 max-w-sm text-[14px] leading-7 text-zinc-400">
              Crea tu espacio privado para configurar tu asistente, su voz y la forma en que conversa contigo.
            </p>

            <div className="pv-auth-demo mt-9 max-w-[390px] rounded-2xl border border-white/[0.08] bg-black/25 p-4 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-300/10 text-teal-200"><VoiceMarkIcon size={13} /></span>
                  Sesión de voz
                </div>
                <span className="pv-kicker !text-[9px] !tracking-[.14em] text-zinc-600">EN VIVO</span>
              </div>
              <div className="flex h-[54px] items-center justify-center gap-[3px]" aria-hidden="true">
                {Array.from({ length: 42 }, (_, index) => {
                  const height = 9 + ((index * 17 + index * index * 3) % 39);
                  return <span key={index} className="pv-auth-wave" style={{ height, animationDelay: `${(index % 9) * -0.13}s`, opacity: 0.38 + (height / 70) }} />;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px] text-zinc-500">
                <span>Audio privado · controles en tus manos</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> LISTO</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/[0.08] pt-5 text-[10px] text-zinc-600">
            <span>Tu identidad verificada por Google</span>
            <span className="pv-mono tracking-wider">PV · 01</span>
          </div>
        </section>

        <section className="pv-auth-form relative flex min-h-[590px] flex-col justify-center overflow-hidden px-6 py-9 sm:px-10 lg:min-h-0 lg:px-11 xl:px-14" aria-labelledby="auth-heading" aria-busy={loading}>
          <div className="pv-auth-form-glow" aria-hidden="true" />
          <div className="pv-auth-secure-tools">
          <div className="pv-auth-secure-badge hidden lg:flex" aria-hidden="true">
            <span className="pv-auth-secure-icon"><ShieldMark /></span>
            <span><strong>ACCESO SEGURO</strong><small>Verificado por Google</small></span>
          </div>
          <div className="pv-auth-theme-switch" role="group" aria-label="Tema de la aplicación"><button type="button" aria-label="Tema claro" aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☼</button><button type="button" aria-label="Tema oscuro" aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>☾</button></div>
          </div>
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-300/25 bg-teal-300/10 text-teal-200"><VoiceMarkIcon /></span>
              <span className="text-sm font-semibold">Pseudo<span className="text-teal-300">Voice</span></span>
            </div>
            <span className="pv-kicker !text-[9px] !tracking-[.15em] text-zinc-600">SECURE ACCESS</span>
          </div>

          <div className="pv-auth-form-content mb-7">
            <p className="pv-kicker text-teal-300/80">TU ESPACIO DE VOZ</p>
            <h2 id="auth-heading" className="mt-2.5 text-[27px] font-semibold tracking-[-0.035em] text-white sm:text-[30px]">
              Continúa con Google
            </h2>
            <p className="mt-2 max-w-sm text-[13px] leading-6 text-zinc-400">
              Inicia sesión o crea tu espacio con Google. Si es tu primera vez, lo crearemos automáticamente.
            </p>
          </div>

          {setupError || error ? (
            <div role="alert" className="pv-auth-form-content mb-4 flex gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-3 text-[12px] leading-5 text-rose-200">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-300/10 text-rose-200"><AlertMark /></span>
              <span>{setupError ?? error}</span>
            </div>
          ) : null}

          <div className="pv-auth-form-content relative mt-1 flex min-h-[48px] w-full justify-center">
            {isDesktop ? (
              <button type="button" onClick={() => void handleDesktopLogin()} disabled={loading || !GOOGLE_DESKTOP_CLIENT_ID} className="flex min-h-12 w-full max-w-[360px] items-center justify-center gap-3 rounded-full border border-white/15 bg-white px-5 text-[14px] font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50">
                <GoogleMark /> Continuar con Google
              </button>
            ) : <div ref={buttonHost} className={`min-h-12 w-full max-w-[360px] ${loading ? "pointer-events-none opacity-45" : ""}`} aria-hidden={loading} />}
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-full border border-white/10 bg-[#101418]/95 text-[13px] text-zinc-300" role="status">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-teal-300" />
                Comprobando tu cuenta…
              </div>
            ) : null}
          </div>
          {!googleReady && !loading && !setupError ? <p className="pv-auth-form-content mt-2 text-center text-[11px] text-zinc-600" role="status">Preparando acceso seguro…</p> : null}

          <div className="pv-auth-form-content my-6 flex items-center gap-3 text-[9px] font-medium uppercase tracking-[.18em] text-zinc-600">
            <span className="h-px flex-1 bg-white/[0.07]" />
            Acceso protegido
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>

          <div className="pv-auth-form-content space-y-3">
            <FeatureLine icon={<ShieldMark />} title="Tu contraseña no pasa por PseudoVoice" detail="Google verifica tu identidad de forma segura." />
            <FeatureLine icon={<PersonMark />} title="Tu espacio es personal" detail="Tus personajes y conversaciones pertenecen a tu cuenta." />
          </div>

          <p className="pv-auth-form-content mt-7 text-center text-[10px] leading-[1.7] text-zinc-600">
            Al continuar, confirmas que usarás voces propias o que tienes permiso para utilizarlas.
          </p>
          <div className="pv-auth-form-content mt-7 flex items-center justify-center gap-2 text-[9px] font-medium tracking-[.14em] text-zinc-700">
            <LockMark /> CONEXIÓN CIFRADA <span className="text-zinc-800">·</span> SESIÓN PRIVADA
          </div>
        </section>
      </div>
      <div className="pv-kicker absolute bottom-3 text-[8px] !tracking-[.18em] text-zinc-700">PSEUDOVOICE · PERSONAL VOICE WORKSPACE</div>
    </main>
  );
}

function FeatureLine({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.055] bg-white/[0.018] px-3.5 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-300/[0.07] text-teal-200/80">{icon}</span>
      <span><span className="block text-[11px] font-medium text-zinc-300">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-zinc-600">{detail}</span></span>
    </div>
  );
}

function ShieldMark() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>; }
function PersonMark() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-3.2 3.2-5 7-5s6.4 1.8 7 5" /></svg>; }
function LockMark() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; }
function AlertMark() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 8v4m0 4h.01" /><circle cx="12" cy="12" r="9" /></svg>; }
function GoogleMark() { return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.7-3.5-11.3-8.2H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.7 27.8a12 12 0 0 1 0-7.6v-5.3H5.8a20 20 0 0 0 0 18.2l6.9-5.3Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.8 14.9l6.9 5.3C14.3 15.5 18.8 12 24 12Z"/></svg>; }
