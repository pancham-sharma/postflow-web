import { supabase } from "@/integrations/supabase/client";
import type { SessionVerification } from "@/lib/auth.functions";

/**
 * Browser-side fallback for local development environments where the server
 * cannot reach Supabase. Auth validates the user remotely, and RLS limits both
 * record checks to the signed-in user's own profile and workspace membership.
 */
export async function verifyAuthenticatedBrowserSession(): Promise<SessionVerification> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("No authenticated user.");

  const userId = userData.user.id;
  const [profile, membership] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (profile.error) throw profile.error;
  if (membership.error) throw membership.error;

  const hasProfile = profile.data != null;
  const hasWorkspace = membership.data != null;
  return { ok: hasProfile && hasWorkspace, userId, hasProfile, hasWorkspace };
}

export async function verifyAuthenticatedSessionWithFallback(): Promise<SessionVerification | null> {
  const { verifyAuthenticatedSession } = await import("@/lib/auth.functions");
  const serverVerification = await Promise.race([
    verifyAuthenticatedSession().catch((error) => {
      console.warn("[auth] server verification unavailable; checking through Supabase RLS", error);
      return null;
    }),
    // Do not leave the login screen hanging when a local Node process cannot
    // reach Supabase even though the browser can.
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
  ]);
  if (serverVerification?.ok) return serverVerification;

  return verifyAuthenticatedBrowserSession().catch((error) => {
    console.error("[auth] browser verification failed", error);
    return null;
  });
}
