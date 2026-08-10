import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DestinationStatus, PostStatus } from "@/lib/publishing-types";
import type { SocialPlatform } from "@/lib/social-platforms";

export type PostDestinationRow = {
  id: string;
  platform: SocialPlatform;
  accountLabel: string | null;
  status: DestinationStatus;
  providerPostUrl: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  publishedAt: string | null;
};

export type PostRow = {
  id: string;
  title: string;
  caption: string;
  postType: string;
  status: PostStatus;
  scheduledAtUtc: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  hashtags: string[];
  linkUrl: string | null;
  mediaCount: number;
  destinations: PostDestinationRow[];
};

const listInput = z.object({
  status: z.string().trim().max(40).nullable().default(null),
  platform: z.string().trim().max(40).nullable().default(null),
  search: z.string().trim().max(120).default(""),
  from: z.string().datetime().nullable().default(null),
  to: z.string().datetime().nullable().default(null),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(5000).default(0),
});

/** Workspace-scoped post list with per-destination results. Powers history + calendar. */
export const listPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<{ posts: PostRow[]; total: number }> => {
    let query = context.supabase
      .from("social_posts")
      .select(
        `id, title, base_caption, base_hashtags, link_url, post_type, status, scheduled_at_utc,
         timezone, created_at, updated_at,
         social_post_media(id),
         social_post_destinations(id, platform, account_label, publish_status, provider_post_url, error_message, error_code, published_at,
           publishing_job_destinations(attempt_count, max_attempts, next_retry_at))`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.status) query = query.eq("status", data.status as PostStatus);
    if (data.search) query = query.or(`title.ilike.%${data.search}%,base_caption.ilike.%${data.search}%`);
    if (data.from) query = query.gte("scheduled_at_utc", data.from);
    if (data.to) query = query.lte("scheduled_at_utc", data.to);

    const { data: rows, error, count } = await query;
    if (error) throw error;

    const posts: PostRow[] = (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      caption: row.base_caption,
      postType: row.post_type,
      status: row.status as PostStatus,
      scheduledAtUtc: row.scheduled_at_utc,
      timezone: row.timezone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hashtags: row.base_hashtags ?? [],
      linkUrl: row.link_url,
      mediaCount: (row.social_post_media ?? []).length,
      destinations: (row.social_post_destinations ?? []).map((d) => {
        const job = ((d as { publishing_job_destinations?: unknown[] }).publishing_job_destinations ??
          [])[0] as
          | { attempt_count?: number; max_attempts?: number; next_retry_at?: string | null }
          | undefined;
        return {
          id: d.id,
          platform: d.platform as SocialPlatform,
          accountLabel: d.account_label,
          status: d.publish_status as DestinationStatus,
          providerPostUrl: d.provider_post_url,
          errorMessage: d.error_message,
          errorCode: d.error_code,
          attemptCount: job?.attempt_count ?? 0,
          maxAttempts: Math.min(job?.max_attempts ?? 3, 3),
          nextRetryAt: job?.next_retry_at ?? null,
          publishedAt: d.published_at,
        };
      }),
    }));

    const filtered = data.platform
      ? posts.filter((p) => p.destinations.some((d) => d.platform === data.platform))
      : posts;

    return { posts: filtered, total: count ?? filtered.length };
  });

/** Moves a scheduled post (and its pending destination jobs) to a new UTC instant. */
export const reschedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ postId: z.string().uuid(), scheduledAtUtc: z.string().datetime() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: post, error: readError } = await context.supabase
      .from("social_posts")
      .select("id, status")
      .eq("id", data.postId)
      .maybeSingle();
    if (readError) throw readError;
    if (!post) throw new Error("Post not found.");
    if (post.status === "published" || post.status === "publishing") {
      throw new Error("This post is already publishing and can no longer be moved.");
    }
    if (new Date(data.scheduledAtUtc).getTime() < Date.now() - 60_000) {
      throw new Error("Pick a time in the future.");
    }

    const { error } = await context.supabase
      .from("social_posts")
      .update({ scheduled_at_utc: data.scheduledAtUtc, status: "queued" })
      .eq("id", data.postId);
    if (error) throw error;

    await context.supabase
      .from("publishing_jobs")
      .update({ scheduled_for: data.scheduledAtUtc })
      .eq("post_id", data.postId)
      .in("status", ["draft", "queued", "validating", "requires_attention"]);

    const { data: jobs } = await context.supabase
      .from("publishing_jobs")
      .select("id")
      .eq("post_id", data.postId);
    const jobIds = (jobs ?? []).map((j) => j.id);
    if (jobIds.length > 0) {
      await context.supabase
        .from("publishing_job_destinations")
        .update({ scheduled_for: data.scheduledAtUtc, next_retry_at: null })
        .in("publishing_job_id", jobIds)
        .in("status", ["pending", "queued", "retry_scheduled", "rate_limited"]);
    }

    return { ok: true, scheduledAtUtc: data.scheduledAtUtc };
  });

/** Cancels a schedule and returns the post to draft, cancelling pending destinations. */
export const cancelPostSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_posts")
      .update({ status: "draft", scheduled_at_utc: null })
      .eq("id", data.postId)
      .in("status", ["draft", "queued", "validating", "requires_attention"]);
    if (error) throw error;

    const { data: jobs } = await context.supabase
      .from("publishing_jobs")
      .select("id")
      .eq("post_id", data.postId);
    const jobIds = (jobs ?? []).map((j) => j.id);
    if (jobIds.length > 0) {
      await context.supabase
        .from("publishing_job_destinations")
        .update({ status: "cancelled" })
        .in("publishing_job_id", jobIds)
        .in("status", ["pending", "queued", "retry_scheduled", "rate_limited"]);
      await context.supabase
        .from("publishing_jobs")
        .update({ status: "cancelled" })
        .in("id", jobIds)
        .in("status", ["draft", "queued", "validating", "requires_attention"]);
    }

    await context.supabase
      .from("social_post_destinations")
      .update({ publish_status: "cancelled" })
      .eq("post_id", data.postId)
      .in("publish_status", ["pending", "validating", "queued", "retry_scheduled", "rate_limited"]);

    return { ok: true };
  });

/** Permanently deletes a draft/cancelled post and its destination rows. */
export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: post, error: readError } = await context.supabase
      .from("social_posts")
      .select("id, status")
      .eq("id", data.postId)
      .maybeSingle();
    if (readError) throw readError;
    if (!post) throw new Error("Post not found.");
    if (!["draft", "cancelled", "failed"].includes(post.status)) {
      throw new Error("Only drafts, cancelled or failed posts can be deleted.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MEDIA_BUCKET } = await import("@/lib/media-library");
    const { data: mediaRows, error: mediaReadError } = await supabaseAdmin
      .from("social_post_media")
      .select("storage_path")
      .eq("post_id", data.postId);
    if (mediaReadError) throw mediaReadError;

    const { error } = await supabaseAdmin.from("social_posts").delete().eq("id", data.postId);
    if (error) throw error;

    const paths = [...new Set((mediaRows ?? []).map((row) => row.storage_path).filter(Boolean))];
    const removable: string[] = [];
    for (const path of paths) {
      const [postRefs, libraryRefs] = await Promise.all([
        supabaseAdmin
          .from("social_post_media")
          .select("id", { count: "exact", head: true })
          .eq("storage_path", path),
        supabaseAdmin
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("storage_path", path),
      ]);
      if (postRefs.error) throw postRefs.error;
      if (libraryRefs.error) throw libraryRefs.error;
      if ((postRefs.count ?? 0) === 0 && (libraryRefs.count ?? 0) === 0) removable.push(path);
    }
    if (removable.length > 0) {
      await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(removable);
    }
    return { ok: true };
  });
