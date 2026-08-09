// Server-side gate for post-OAuth redirects. The browser may hold a session
// object that the backend has not accepted (cancelled consent, replayed
// callback, revoked token). Only this check — run with the bearer token against
// the database — may authorize a redirect into /app.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SessionVerification = {
  ok: boolean;
  userId: string;
  hasProfile: boolean;
  hasWorkspace: boolean;
};

export const verifyAuthenticatedSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionVerification> => {
    const { supabase, userId } = context;

    const read = async () => {
      const [profile, membership] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
        supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle(),
      ]);
      if (profile.error) console.error("[auth] profile read failed", profile.error.message);
      if (membership.error) console.error("[auth] membership read failed", membership.error.message);
      return {
        hasProfile: profile.data != null,
        hasWorkspace: membership.data != null,
      };
    };

    let { hasProfile, hasWorkspace } = await read();

    // Self-heal instead of rejecting the session: a valid bearer token means the
    // user exists in auth — a missing profile/workspace row (or a read blocked by
    // policy) is our provisioning gap, not a failed sign-in.
    if (!hasProfile || !hasWorkspace) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authUser?.user?.email ?? null;
        const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const displayName =
          (typeof meta['full_name'] === "string" && meta['full_name']) ||
          (typeof meta['name'] === "string" && meta['name']) ||
          (email ? email.split("@")[0] : null) || "PostFlow user";

        await supabaseAdmin
          .from("profiles")
          .upsert({ id: userId, email, display_name: displayName }, { onConflict: "id" });

        const { data: existing } = await supabaseAdmin
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (!existing) {
          const { data: ws } = await supabaseAdmin
            .from("workspaces")
            .insert({ name: `${displayName}'s workspace`, owner_id: userId })
            .select("id")
            .single();
          if (ws) {
            await supabaseAdmin
              .from("workspace_members")
              .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
          }
        }

        const { data: profileCheck } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        const { data: memberCheck } = await supabaseAdmin
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        hasProfile = profileCheck != null;
        hasWorkspace = memberCheck != null;
      } catch (error) {
        console.error("[auth] provisioning repair failed", error);
      }
    }

    return { ok: hasProfile && hasWorkspace, userId, hasProfile, hasWorkspace };
  });
