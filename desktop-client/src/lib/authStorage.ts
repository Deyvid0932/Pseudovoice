export interface AuthUser {
  userId: number;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  accessToken: string;
  role: "USER" | "ADMIN";
}

const SESSION_KEY = "pseudovoice.auth.session";

export function readAuthSession(): AuthUser | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as AuthUser;
    if (!Number.isInteger(session.userId) || !session.accessToken || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}

export function readAccessToken(): string | null {
  return readAuthSession()?.accessToken ?? null;
}

export function saveAuthSession(session: AuthUser): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
