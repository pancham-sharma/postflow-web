import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDiagnosticInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberData } = await supabaseAdmin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    // To get auth.uid() from Postgres without a custom RPC, we can insert a dummy row into media_folders
    // and see if it sets created_by correctly (if there's a default) or we can query an existing table.
    // Actually, let's query `workspace_members` using the USER client. If auth.uid() works, they can see their own membership.
    const { data: userClientMemberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    return {
      authenticatedUserId: userId,
      workspaceId,
      isWorkspaceMember: !!memberData,
      supabaseAuthUidMatches: !memberError && !!userClientMemberData,
      memberError: memberError ? memberError.message : null,
      globalHeaders: (supabase as any).rest?.headers || {},
    };
  });
