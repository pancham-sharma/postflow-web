import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

export default defineTool({
  name: "schedule_post",
  title: "Schedule a post",
  description:
    "Queue a PostFlow publish job for one connected platform, optionally scheduled for a future time. The caller must already have that platform connected.",
  inputSchema: {
    platform: z.enum(SOCIAL_PLATFORMS).describe("Target platform for this post."),
    title: z.string().trim().min(1).max(200).describe("Post title shown in PostFlow."),
    caption: z.string().trim().max(2200).nullable().describe("Caption text, or null."),
    mediaUrl: z.string().url().nullable().describe("Public URL of the media to publish, or null."),
    scheduledFor: z
      .string()
      .nullable()
      .describe("ISO 8601 timestamp to publish at, or null to queue immediately."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ platform, title, caption, mediaUrl, scheduledFor }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId();
    if (!userId) {
      return { content: [{ type: "text", text: "Missing user identity" }], isError: true };
    }

    let scheduledIso: string | null = null;
    if (scheduledFor) {
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime())) {
        return {
          content: [{ type: "text", text: "scheduledFor is not a valid ISO 8601 timestamp." }],
          isError: true,
        };
      }
      scheduledIso = when.toISOString();
    }

    const supabase = supabaseForUser(ctx);
    const { data: connection } = await supabase
      .from("social_connections")
      .select("id")
      .eq("platform", platform)
      .maybeSingle();
    if (!connection) {
      return {
        content: [
          {
            type: "text",
            text: `No connected ${platform} account. Connect it on the Accounts page in PostFlow first.`,
          },
        ],
        isError: true,
      };
    }

    const { data, error } = await supabase
      .from("publish_jobs")
      .insert({
        user_id: userId,
        platform,
        post_title: title,
        status: "queued",
        scheduled_for: scheduledIso,
        request_payload: { caption, media_url: mediaUrl, source: "mcp" },
      })
      .select("id, platform, post_title, status, scheduled_for, created_at")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Queued job ${data.id} for ${platform}.` }],
      structuredContent: { job: data },
    };
  },
});
