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

/** Starts (or restarts) the Google OAuth round-trip through Supabase Auth. */
export async function startGoogleSignIn(next?: string | null) {
  const { supabase } = await import("@/integrations/supabase/client");
  rememberNext(next ?? null);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Public same-origin callback — the status page verifies then forwards.
      redirectTo: window.location.origin + "/auth/callback",
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
