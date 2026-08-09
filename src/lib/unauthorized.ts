import { supabase } from "@/integrations/supabase/client";

function isUnauthorized(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unauthorized|no authorization header|jwt|session_not_found/i.test(message);
}

let signingOut = false;

/**
 * Wraps a protected server-function call. When the Supabase session is missing or
 * stale the request 401s — instead of crashing the route we clear the dead session
 * and send the user back to /login once.
 */
export async function withAuthRecovery<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    if (typeof window !== "undefined" && !signingOut) {
      signingOut = true;
      try {
        await supabase.auth.signOut();
      } catch {
        // session already gone
      }
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
    }
    return fallback;
  }
}
