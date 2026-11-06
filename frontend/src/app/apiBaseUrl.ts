/**
 * The URL every API call starts with. The one place the app reads `VITE_API_BASE_URL`.
 *
 * Unset or empty, the app calls `/api/v1` on its own origin: the Vite proxy in development and
 * preview sends it to the backend (`API_PROXY_TARGET`, http://localhost:8020 by default).
 */
export function apiBaseUrl(): string {
  const origin = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  return `${origin}/api/v1`
}
