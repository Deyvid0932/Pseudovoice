import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearAuthSession, readAuthSession, saveAuthSession, type AuthUser } from "../lib/authStorage";
import { authService } from "../services/authService";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithGoogleDesktop: (authorization: { authorizationCode: string; codeVerifier: string; redirectUri: string }) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readAuthSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setError(null);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setError("Tu sesión venció. Vuelve a entrar con Google.");
    };
    window.addEventListener("pseudovoice:auth-expired", onExpired);
    return () => window.removeEventListener("pseudovoice:auth-expired", onExpired);
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await authService.signInWithGoogle(idToken);
      saveAuthSession(session);
      setUser(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión con Google.");
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithGoogleDesktop = useCallback(async (authorization: { authorizationCode: string; codeVerifier: string; redirectUri: string }) => {
    setLoading(true);
    setError(null);
    try {
      const session = await authService.signInWithGoogleDesktop(authorization);
      saveAuthSession(session);
      setUser(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión con Google.");
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    user, loading, error, signInWithGoogle, signInWithGoogleDesktop, signOut, clearError: () => setError(null),
  }), [user, loading, error, signInWithGoogle, signInWithGoogleDesktop, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
