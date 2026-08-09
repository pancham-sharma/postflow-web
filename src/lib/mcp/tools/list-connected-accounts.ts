import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { connectionStatus } from "@/lib/social-platforms";

export default defineTool({
  name: "list_connected_accounts",
  title: "List connected accounts",
  description:
    "List the social accounts the signed-in user has connected to PostFlow, with platform, account name, granted scopes and token expiry status. Never returns tokens.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("social_connections")
      .select("id, platform, account_name, username, scopes, token_expires_at, last_sync_at")
      .order("platform");

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const accounts = (data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      accountName: row.account_name,
      username: row.username,
      scopes: row.scopes,
      tokenExpiresAt: row.token_expires_at,
      lastSyncAt: row.last_sync_at,
      status: connectionStatus(row.token_expires_at),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }],
      structuredContent: { accounts },
    };
  },
});
