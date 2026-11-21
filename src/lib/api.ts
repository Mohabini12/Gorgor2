// API base + token helper. On Vercel (web) NEXT_PUBLIC_API_BASE is empty => same-origin.
// In the Android APK it is set to the Vercel URL => all /api calls go to the backend.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
// Registration is OFF unless NEXT_PUBLIC_ALLOW_REGISTRATION=true
export const REGISTRATION_ENABLED =
  process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === "true";

const TOKEN_KEY = "gorgor_token";
const SIGNED_OUT_KEY = "gorgor_signed_out";

export function apiUrl(path: string): string {
  return path.startsWith("/api/") ? API_BASE + path : path;
}
export function getToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null | undefined) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.removeItem(SIGNED_OUT_KEY);
    }
  } catch {}
}
export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {}
}
function isSignedOut(): boolean {
  try { return window.localStorage.getItem(SIGNED_OUT_KEY) === "1"; } catch { return false; }
}

if (typeof window !== "undefined" && !(window as unknown as { __gorgorFetch?: boolean }).__gorgorFetch) {
  (window as unknown as { __gorgorFetch?: boolean }).__gorgorFetch = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
      const headers = new Headers(init?.headers);
      const t = getToken();
      if (t && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);
      if (isSignedOut()) headers.set("X-Signed-Out", "1");
      return orig(API_BASE + input, { ...init, headers });
    }
    return orig(input, init);
  };
}
