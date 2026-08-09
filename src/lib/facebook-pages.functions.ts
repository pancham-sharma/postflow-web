// Facebook Page linking: organic publishing only works against a Page with a
// page-scoped token, so the user picks the Page once and we store it safely.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FacebookPageOption = {
  id: string;
  name: string;
  category: string | null;
  canPublish: boolean;
};

const GRAPH = "https://graph.facebook.com/v21.0";

/** Lists the Pages this Facebook connection administers, plus the selected one. */
export const listFacebookPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ connectionId: z.string().uuid() }).parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ pages: FacebookPageOption[]; selectedPageId: string | null; error: string | null }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { decryptToken } = await import("@/lib/token-crypto.server");

      const { data: row } = await supabaseAdmin
        .from("social_connections")
        .select("id, platform, metadata, access_token_ciphertext")
        .eq("id", data.connectionId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!row || row.platform !== "facebook") {
        return { pages: [], selectedPageId: null, error: "That Facebook connection was not found." };
      }

      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const selectedPageId = metadata["page_id"] ? String(metadata["page_id"]) : null;

      const token = decryptToken(row.access_token_ciphertext);
      const toOptions = (list: unknown): FacebookPageOption[] =>
        (Array.isArray(list) ? list : [])
          .map((page: Record<string, any>) => ({
            id: String(page?.["id"] ?? ""),
            name: String(page?.["name"] ?? "Untitled Page"),
            category: page?.["category"] ? String(page["category"]) : null,
            canPublish: Array.isArray(page?.["tasks"]) ? page["tasks"].includes("CREATE_CONTENT") : true,
          }))
          .filter((p) => p.id);

      const seen = new Map<string, FacebookPageOption>();
      let lastError: string | null = null;

      // Pages come from several places depending on how the account is set up:
      // classic admin (/me/accounts) and Business-portfolio owned Pages.
      const sources = [
        `${GRAPH}/me/accounts?fields=id,name,category,tasks&limit=100`,
        `${GRAPH}/me/businesses?fields=id,owned_pages{id,name,category,tasks},client_pages{id,name,category,tasks}&limit=50`,
      ];

      for (const url of sources) {
        try {
          const response = await fetch(`${url}&access_token=${encodeURIComponent(token)}`);
          const payload = (await response.json()) as Record<string, any>;
          if (!response.ok) {
            if (typeof payload?.["error"]?.message === "string") lastError = payload["error"].message;
            continue;
          }
          const rows = Array.isArray(payload["data"]) ? payload["data"] : [];
          const collected =
            url.includes("/me/businesses")
              ? rows.flatMap((biz: Record<string, any>) => [
                  ...toOptions(biz?.["owned_pages"]?.["data"]),
                  ...toOptions(biz?.["client_pages"]?.["data"]),
                ])
              : toOptions(rows);
          for (const page of collected) seen.set(page.id, page);
        } catch {
          lastError = "Facebook could not be reached right now.";
        }
      }

      const pages = [...seen.values()];
      return {
        pages,
        selectedPageId,
        error:
          pages.length > 0
            ? null
            : (lastError ??
              "Facebook returned no Pages for this login. Make sure you are an admin of a Page, press Reconnect and tick the Page in Facebook's permission screen — or paste the Page ID below."),
      };
    },
  );

/** Stores the chosen Page id, name and page-scoped token on the connection. */
export const selectFacebookPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ connectionId: z.string().uuid(), pageId: z.string().trim().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; pageName: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("@/lib/token-crypto.server");

    const { data: row } = await supabaseAdmin
      .from("social_connections")
      .select("id, platform, metadata, access_token_ciphertext, workspace_id")
      .eq("id", data.connectionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row || row.platform !== "facebook") throw new Error("That Facebook connection was not found.");

    const response = await fetch(
      `${GRAPH}/${encodeURIComponent(data.pageId)}?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(
        decryptToken(row.access_token_ciphertext),
      )}`,
    );
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok || !payload["access_token"]) {
      throw new Error(
        typeof payload?.["error"]?.message === "string"
          ? payload["error"].message
          : "Facebook did not return a Page access token. Reconnect Facebook and approve Page publishing.",
      );
    }

    const metadata = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
      page_id: String(payload["id"] ?? data.pageId),
      page_name: String(payload["name"] ?? ""),
      page_access_token: String(payload["access_token"]),
      page_tasks: Array.isArray(payload["tasks"]) ? payload["tasks"].map(String) : [],
      token_updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("social_connections")
      .update({ metadata: metadata as never, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw error;

    await supabaseAdmin.from("social_account_events").insert({
      workspace_id: row.workspace_id,
      social_account_id: row.id,
      event_type: "facebook_page_selected",
      event_data: { page_id: metadata["page_id"], page_name: metadata["page_name"] },
      created_by: context.userId,
    });

    return { ok: true, pageName: String(metadata["page_name"] ?? "") };
  });