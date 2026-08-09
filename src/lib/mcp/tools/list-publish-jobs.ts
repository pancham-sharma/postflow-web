import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export default defineTool({
  name: "list_publish_jobs",
  title: "List publish jobs",
  description:
    "List the signed-in user's PostFlow publish jobs, newest first. Optionally filter by status or platform.",
  inputSchema: {
    status: z.enum(JOB_STATUSES).nullable().describe("Filter by job status, or null for all."),
    platform: z
      .enum(SOCIAL_PLATFORMS)
      .nullable()
      .describe("Filter by target platform, or null for all."),
    limit: z.number().int().min(1).max(50).nullable().describe("Max rows to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, platform, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("publish_jobs")
      .select(
        "id, platform, post_title, status, scheduled_for, attempt_count, max_attempts, next_retry_at, error_code, error_message, created_at, finished_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (status) query = query.eq("status", status);
    if (platform) query = query.eq("platform", platform);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
