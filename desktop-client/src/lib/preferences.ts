export type Theme = "dark" | "light";
export function readThemePreference(): Theme {
  const value = readPreference("theme", "light");
  return value === "dark" || value === "light" ? value : "light";
}
export function readPreference(key: string, fallback: string): string {
  try { return localStorage.getItem(`pseudovoice.${key}`) || fallback; } catch { return fallback; }
}
export function savePreference(key: string, value: string): void {
  try { localStorage.setItem(`pseudovoice.${key}`, value); } catch { /* Session preference still applies. */ }
}
