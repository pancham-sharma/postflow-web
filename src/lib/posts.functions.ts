import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

const publishInput = z.object({
  title: z.string().trim().min(1, "Add a post title").max(200),
  caption: z.string().trim().max(2200).default(""),
  description: z.string().trim().max(5000).default(""),
  hashtags: z.string().trim().max(600).default(""),
  linkUrl: z.string().trim().max(500).default(""),
  altText: z.string().trim().max(500).default(""),
  mediaPath: z.string().trim().max(500).nullable().default(null),
  mediaName: z.string().trim().max(300).nullable().default(null),
  mediaType: z.string().trim().max(100).nullable().default(null),
  mediaSize: z.number().int().nonnegative().nullable().default(null),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1, "Select at least one platform"),
  scheduledFor: z.string().datetime().nullable().default(null),
});

export type PublishPostInput = z.input<typeof publishInput>;

export type PublishPostResult = {
  created: { id: string; platform: string }[];
  scheduled: boolean;
};

/** Creates one publish job per selected platform, plus a queued timeline event. */
export const publishPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => publishInput.parse(data))
  .handler(async ({ data, context }): Promise<PublishPostResult> => {
    const { supabase, userId } = context;

    // Only allow platforms the user has actually connected.
    const { data: connections, error: connError } = await supabase
      .from("social_connections")
      .select("platform, account_name")
      .eq("user_id", userId);
    if (connError) throw connError;

    const connected = new Map(
      (connections ?? []).map((c) => [c.platform, c.account_name as string]),
    );
    const targets = data.platforms.filter((p) => connected.has(p));
    if (targets.length === 0) {
      throw new Error("None of the selected platforms are connected. Connect an account first.");
    }

    const hashtags = data.hashtags
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

    const payload = {
      caption: data.caption,
      description: data.description,
      hashtags,
      link_url: data.linkUrl || null,
      alt_text: data.altText || null,
      media: data.mediaPath
        ? {
            bucket: "post-media",
            path: data.mediaPath,
            name: data.mediaName,
            type: data.mediaType,
            size: data.mediaSize,
          }
        : null,
    };

    const rows = targets.map((platform) => ({
      user_id: userId,
      platform,
      post_title: data.title,
      status: "queued" as const,
      scheduled_for: data.scheduledFor,
      request_payload: { ...payload, account_name: connected.get(platform) ?? null },
    }));

    const { data: inserted, error } = await supabase
      .from("publish_jobs")
      .insert(rows)
      .select("id, platform");
    if (error) throw error;

    const created = inserted ?? [];
    if (created.length > 0) {
      await supabase.from("publish_job_events").insert(
        created.map((job) => ({
          job_id: job.id,
          kind: "queued",
          message: data.scheduledFor
            ? `Scheduled for ${new Date(data.scheduledFor).toISOString()}`
            : "Queued for immediate publishing",
          detail: { platform: job.platform, has_media: Boolean(data.mediaPath) },
        })),
      );
    }

    return { created, scheduled: Boolean(data.scheduledFor) };
  });
