// Where the user meant to go before we sent them through Google. Kept in
// sessionStorage (never in redirect_uri) so the OAuth redirect target stays a
// public, same-origin URL.
const KEY = "postflow:next";

export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  return next.slice(0, 500);
}

export function rememberNext(next: string | null | undefined) {
  const safe = safeNextPath(next);
  if (typeof window === "undefined") return;
  if (safe) sessionStorage.setItem(KEY, safe);
  else sessionStorage.removeItem(KEY);
}

export function takeNext(): string | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return safeNextPath(stored);
}

export function peekNext(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(sessionStorage.getItem(KEY));
}

export function clearNext() {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function googleRedirectOrigin(): string {
  const configured = String(import.meta.env.VITE_POSTFLOW_APP_URL ?? "").trim();
  const current = window.location.origin;

  // Local development intentionally follows the local browser origin, even
  // when an ignored .env.local contains production provider URLs.
  if (import.meta.env.DEV) return current;

  if (configured) {
    try {
      const origin = new URL(configured, current).origin;
      if (isLoopbackOrigin(origin)) {
        throw new Error("POSTFLOW_APP_URL must not be loopback in production.");
      }
      return origin;
    } catch (error) {
      if (error instanceof Error && error.message.includes("loopback")) throw error;
    }
  }

  // A missing production setting may use the current public host as a safe
  // fallback, but never allow a deployed build to send users to loopback.
  if (isLoopbackOrigin(current)) {
    throw new Error("POSTFLOW_APP_URL is required for production Google sign-in.");
  }
  return current;
}

/** Starts (or restarts) the Google OAuth round-trip through Supabase Auth. */
export async function startGoogleSignIn(next?: string | null) {
  const { supabase } = await import("@/integrations/supabase/client");
  rememberNext(next ?? null);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Public same-origin callback — the status page verifies then forwards.
      redirectTo: `${googleRedirectOrigin()}/auth/callback`,
      queryParams: { prompt: "select_account consent" },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return {
      redirected: false,
      error: error ?? new Error("Supabase did not return a Google authorization URL."),
    };
  }

  window.location.assign(data.url);
  return { redirected: true, error: null };
}
