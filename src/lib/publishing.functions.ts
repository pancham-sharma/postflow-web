// Client-callable publishing API: create/validate/schedule posts, watch progress,
// retry or cancel individual destinations. Every call is workspace-scoped.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import type { PublishingProgress, DestinationProgress, PostStatus } from "@/lib/publishing-types";
import type { ValidationResult } from "@/lib/publishing-types";
import type { SocialPlatform } from "@/lib/social-platforms";

const destinationInput = z.object({
  socialAccountId: z.string().uuid(),
  platform: z.enum(SOCIAL_PLATFORMS),
  caption: z.string().max(20000).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(20000).optional(),
  hashtags: z.array(z.string().max(80)).max(40).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  // Platform-specific content card fields.
  hook: z.string().max(500).optional(),
  keywords: z.array(z.string().max(80)).max(40).optional(),
  tags: z.array(z.string().max(80)).max(60).optional(),
  callToAction: z.string().max(300).optional(),
  altText: z.string().max(2000).optional(),
  firstComment: z.string().max(5000).optional(),
  pinnedComment: z.string().max(5000).optional(),
  overlayText: z.string().max(300).optional(),
  destinationUrl: z.string().max(2000).nullable().optional(),
  location: z.string().max(200).optional(),
  scheduledAtUtc: z.string().datetime().nullable().optional(),
  aiGenerated: z.boolean().optional(),
  manuallyEdited: z.boolean().optional(),
});

const mediaInput = z.object({
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(3).max(100),
  fileSize: z.number().int().nonnegative().max(5 * 1024 * 1024 * 1024),
  originalFilename: z.string().max(300).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationSeconds: z.number().nonnegative().max(60 * 60 * 12).optional(),
  altText: z.string().max(1000).optional(),
});

const createPostInput = z.object({
  title: z.string().max(300).default(""),
  caption: z.string().max(20000).default(""),
  description: z.string().max(20000).default(""),
  hashtags: z.array(z.string().max(80)).max(40).default([]),
  linkUrl: z.string().url().max(2000).nullable().optional(),
  scheduledAtUtc: z.string().datetime().nullable().optional(),
  timezone: z.string().max(80).optional(),
  publishNow: z.boolean().default(true),
  media: mediaInput.nullable().optional(),
  destinations: z.array(destinationInput).min(1).max(20),
  idempotencyKey: z.string().min(8).max(120),
  reusedPostId: z.string().uuid().optional(),
});

const POST_MEDIA_OBJECT_MAX_BYTES = 512 * 1024 * 1024;

function jsonByteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

/** Creates the post, its destinations and a queued job, then validates each destination. */
export const createAndQueuePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createPostInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const { isAllowedMimeType, isSafeStoragePath, classifyMedia } = await import(
      "@/lib/media-processing.server"
    );
    const { loadCapabilities, validateDestination } = await import(
      "@/lib/publishing-validation.server"
    );

    const workspaceId = await resolveWorkspaceId(userId);
    console.info("[POST_CREATE]", {
      request_size: jsonByteSize({ ...data, media: data.media ? { ...data.media } : null }),
      media_size: data.media?.fileSize ?? 0,
      media_mime: data.media?.mimeType ?? null,
      media_id: data.media?.storagePath ?? null,
      platforms: data.destinations.map((destination) => destination.platform),
    });

    // Idempotency: the same key returns the existing job instead of duplicating.
    const { data: existing } = await supabaseAdmin
      .from("publishing_jobs")
      .select("id, post_id")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) return { postId: existing.post_id, jobId: existing.id, validations: [] as ValidationResult[] };

    if (data.media) {
      if (data.media.fileSize > POST_MEDIA_OBJECT_MAX_BYTES) {
        throw new Error("This media file exceeds the post-media storage limit of 512 MiB.");
      }
      if (!isAllowedMimeType(data.media.mimeType)) {
        throw new Error("That file type is not supported.");
      }
      if (!isSafeStoragePath(data.media.storagePath, userId)) {
        throw new Error("That upload could not be verified.");
      }
    }

    // Only accounts in this workspace may be targeted.
    const accountIds = data.destinations.map((d) => d.socialAccountId);
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from("social_connections")
      .select(
        "id, platform, account_name, username, scopes, connection_status, token_expires_at, publishing_enabled, publishing_eligible",
      )
      .eq("workspace_id", workspaceId)
      .in("id", accountIds);
    if (accountsError) throw accountsError;
    if ((accounts?.length ?? 0) !== new Set(accountIds).size) {
      throw new Error("One of the selected accounts is not available in this workspace.");
    }
    const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

    const scheduled = !data.publishNow && data.scheduledAtUtc ? data.scheduledAtUtc : null;

    const { data: post, error: postError } = await supabaseAdmin
      .from("social_posts")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title,
        base_caption: data.caption,
        base_description: data.description,
        base_hashtags: data.hashtags,
        link_url: data.linkUrl ?? null,
        post_type: data.media ? classifyMedia(data.media.mimeType) : "text",
        status: "validating",
        scheduled_at_utc: scheduled,
        timezone: data.timezone ?? "UTC",
        idempotency_key: data.idempotencyKey,
        reused_from_post_id: (data.reusedPostId ?? null) as never,
      })
      .select("id")
      .single();
    if (postError) throw postError;

    let mediaTypeStr = "none";
    let mediaSize = 0;
    let mediaDuration = 0;
    let mediaAspectRatio: number | null = null;
    let mediaMimeType: string | null = null;

    if (data.media) {
      const mediaType = classifyMedia(data.media.mimeType);
      mediaTypeStr = mediaType;
      mediaSize = data.media.fileSize;
      mediaDuration = data.media.durationSeconds ?? 0;
      const aspect =
        data.media.width && data.media.height ? data.media.width / data.media.height : null;
      mediaAspectRatio = aspect;
      mediaMimeType = data.media.mimeType;
      
      const { error: mediaError } = await supabaseAdmin.from("social_post_media").insert({
        post_id: post.id,
        workspace_id: workspaceId,
        storage_path: data.media.storagePath,
        media_type: mediaType,
        mime_type: data.media.mimeType,
        file_size: data.media.fileSize,
        width: data.media.width ?? null,
        height: data.media.height ?? null,
        duration_seconds: data.media.durationSeconds ?? null,
        aspect_ratio: aspect,
        original_filename: data.media.originalFilename ?? null,
        alt_text: data.media.altText ?? null,
        processing_status: "ready",
        sort_order: 0,
      });
      if (mediaError) throw mediaError;
    }

    const { data: destinations, error: destError } = await supabaseAdmin
      .from("social_post_destinations")
      .insert(
        data.destinations.map((d) => {
          const account = accountById.get(d.socialAccountId)!;
          return {
            post_id: post.id,
            workspace_id: workspaceId,
            social_account_id: d.socialAccountId,
            platform: d.platform,
            account_label: account.account_name,
            platform_caption: d.caption ?? data.caption,
            platform_title: d.title ?? data.title,
            platform_description: d.description ?? data.description,
            platform_hashtags: d.hashtags ?? data.hashtags,
            platform_settings: (d.settings ?? {}) as never,
            validation_status: "pending",
            publish_status: "pending" as const,
          };
        }),
      )
      .select("id, platform, social_account_id, account_label, platform_settings");
    if (destError) throw destError;

    // Canonical per-platform content record for each destination card.
    const { error: contentError } = await supabaseAdmin.from("post_platform_contents").insert(
      (destinations ?? []).map((dest) => {
        const d = data.destinations.find((x) => x.socialAccountId === dest.social_account_id)!;
        return {
          post_id: post.id,
          workspace_id: workspaceId,
          destination_id: dest.id,
          platform: dest.platform,
          card_key: dest.id,
          connected_account_id: dest.social_account_id,
          title: d.title ?? "",
          hook: d.hook ?? "",
          caption: d.caption ?? "",
          description: d.description ?? "",
          hashtags_json: (d.hashtags ?? []) as never,
          keywords_json: (d.keywords ?? []) as never,
          tags_json: (d.tags ?? []) as never,
          call_to_action: d.callToAction ?? "",
          alt_text: d.altText ?? "",
          first_comment: d.firstComment ?? "",
          pinned_comment: d.pinnedComment ?? "",
          overlay_text: d.overlayText ?? "",
          destination_url: d.destinationUrl ?? data.linkUrl ?? null,
          location: d.location ?? "",
          platform_settings_json: (d.settings ?? {}) as never,
          ai_generated: d.aiGenerated ?? false,
          manually_edited: d.manuallyEdited ?? false,
          scheduled_at: d.scheduledAtUtc ?? scheduled,
        };
      }),
    );
    if (contentError) throw contentError;

    // Validate every destination against the stored capability rules.
    const capabilities = await loadCapabilities();
    const validations: ValidationResult[] = (destinations ?? []).map((dest) => {
      const account = accountById.get(dest.social_account_id!)!;
      const input = data.destinations.find((d) => d.socialAccountId === dest.social_account_id);
      return validateDestination(
        {
          destinationId: dest.id,
          platform: dest.platform as SocialPlatform,
          accountId: account.id,
          accountLabel: dest.account_label ?? account.account_name,
          accountScopes: account.scopes ?? [],
          accountConnected: account.connection_status !== "disconnected",
          tokenExpiresAt: account.token_expires_at,
          publishingEnabled: account.publishing_enabled,
          publishingEligible: account.publishing_eligible,
          title: input?.title ?? data.title,
          caption: input?.caption ?? data.caption,
          description: input?.description ?? data.description,
          hashtags: input?.hashtags ?? data.hashtags,
          linkUrl: data.linkUrl ?? null,
          settings: (input?.settings ?? {}) as Record<string, unknown>,
          media: {
            mediaType: mediaTypeStr as "image" | "video" | "none",
            mimeType: mediaMimeType,
            fileSize: mediaSize,
            durationSeconds: mediaDuration,
            hasLink: !!data.linkUrl,
            aspectRatio: mediaAspectRatio,
          },
        },
        capabilities[dest.platform],
      );
    });

    const hasBlockedDestination = validations.some((validation) => validation.status === "blocked");
    for (const validation of validations) {
      await supabaseAdmin
        .from("social_post_destinations")
        .update({
          validation_status: validation.status,
          validation_issues: validation.issues as never,
          publish_status: hasBlockedDestination ? "failed" : "queued",
          ...(hasBlockedDestination
            ? {
                error_code: "validation_failed",
                error_message:
                  validation.issues.find((i) => !i.canAutoFix)?.message ??
                  "Another selected platform needs attention before publishing.",
              }
            : {}),
        })
        .eq("id", validation.destinationId);
    }

    // Publishing is all-or-nothing for the selected destinations. A separate
    // explicit "publish available" action can be added later; the normal
    // Publish Now flow must never silently drop a selected platform.
    const publishable = hasBlockedDestination
      ? []
      : validations.filter((v) => v.status !== "blocked");
    console.info("[PUBLISH_JOB]", {
      payload_size: jsonByteSize({
        post_id: post.id,
        platforms: validations.map((validation) => validation.platform),
        media_id: data.media?.storagePath ?? null,
      }),
      media_size: data.media?.fileSize ?? 0,
      platforms: validations.map((validation) => validation.platform),
    });
    const { data: job, error: jobError } = await supabaseAdmin
      .from("publishing_jobs")
      .insert({
        post_id: post.id,
        workspace_id: workspaceId,
        job_type: scheduled ? "schedule" : "publish_now",
        status: publishable.length === 0 ? "failed" : "queued",
        scheduled_for: scheduled,
        idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

    if (publishable.length > 0) {
      const { error: jdError } = await supabaseAdmin.from("publishing_job_destinations").insert(
        publishable.map((v) => {
          const own = data.destinations.find((d) => d.socialAccountId === v.accountId);
          return {
            publishing_job_id: job.id,
            social_post_destination_id: v.destinationId,
            workspace_id: workspaceId,
            social_account_id: v.accountId,
            platform: v.platform,
            status: "queued" as const,
            // A card may carry its own send time; otherwise it follows the post.
            scheduled_for: own?.scheduledAtUtc ?? scheduled,
            // Three attempts maximum; only temporary failures ever use them.
            max_attempts: Math.min(capabilities[v.platform]?.max_retries ?? 3, 3),
          };
        }),
      );
      if (jdError) throw jdError;
    }

    await supabaseAdmin
      .from("social_posts")
      .update({ status: publishable.length === 0 ? "failed" : scheduled ? "queued" : "publishing" })
      .eq("id", post.id);

    return { postId: post.id, jobId: job.id, validations };
  });

export const dispatchPublishingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: job, error: jobError } = await context.supabase.from("publishing_jobs").select("id, job_type").eq("id", data.jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job || job.job_type !== "publish_now") throw new Error("Publishing job not found.");
    const { data: rows, error } = await context.supabase
      .from("publishing_job_destinations")
      .select("id, scheduled_for")
      .eq("publishing_job_id", job.id)
      .in("status", ["pending", "queued", "retry_scheduled", "rate_limited"]);
    if (error) throw error;
    const { processJobDestination } = await import("@/lib/publishing.server");
    // Cards with their own future send time are left for the scheduled runner.
    const due = (rows ?? []).filter(
      (row) => !row.scheduled_for || new Date(row.scheduled_for).getTime() <= Date.now(),
    );
    const results = await Promise.all(due.map((row) => processJobDestination(row.id)));
    return { processed: results.length, results };
  });

/**
 * Safety net for "stuck on Queued": processes any due destination in the
 * caller's workspace that the one-shot dispatch never picked up (tab closed,
 * navigation aborted the request, transient error).
 */
export const runDuePublishingForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(userId);

    const staleLock = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("publishing_job_destinations")
      .select(
        "id, status, scheduled_for, next_retry_at, locked_at, updated_at, attempt_count, max_attempts",
      )
      .eq("workspace_id", workspaceId)
      .in("status", [
        "pending",
        "queued",
        "retry_scheduled",
        "rate_limited",
        "processing",
        // Orphaned in-flight rows: the worker that claimed them died.
        "validating",
        "uploading",
      ])
      .order("created_at", { ascending: true })
      .limit(10);
    if (error) throw error;

    const now = Date.now();
    const inFlight = new Set(["validating", "uploading"]);
    const orphanCutoff = now - 5 * 60 * 1000;
    const due = (rows ?? []).filter((row) => {
      if ((row.attempt_count ?? 0) >= (row.max_attempts ?? 3)) return false;
      if (row.locked_at && row.locked_at > staleLock) return false;
      if (inFlight.has(row.status)) {
        // Only reclaim once the row has clearly stopped making progress.
        if (new Date(row.updated_at).getTime() > orphanCutoff) return false;
      }
      if (row.scheduled_for && new Date(row.scheduled_for).getTime() > now) return false;
      if (row.next_retry_at && new Date(row.next_retry_at).getTime() > now) return false;
      return true;
    });
    if (due.length === 0) return { processed: 0 };

    const { processJobDestination, pollProcessingDestination } = await import(
      "@/lib/publishing.server"
    );
    let processed = 0;
    for (const row of due.slice(0, 5)) {
      try {
        await (row.status === "processing"
          ? pollProcessingDestination(row.id)
          : processJobDestination(row.id));
        processed += 1;
      } catch (cause) {
        console.error("[dispatch] destination failed", row.id, cause);
      }
    }
    return { processed };
  });

/** Live progress for one post: parent status plus every destination. */
export const getPublishingQueueHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertRole } = await import("@/lib/admin-helpers");
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const waiting = ["pending", "queued", "retry_scheduled", "rate_limited"] as const;
    const inFlight = ["validating", "uploading", "processing"] as const;
    const [queued, publishing, failed, oldest, lastAttempt] = await Promise.all([
      supabaseAdmin
        .from("publishing_job_destinations")
        .select("id", { count: "exact", head: true })
        .in("status", waiting),
      supabaseAdmin
        .from("publishing_job_destinations")
        .select("id", { count: "exact", head: true })
        .in("status", inFlight),
      supabaseAdmin
        .from("publishing_job_destinations")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabaseAdmin
        .from("publishing_job_destinations")
        .select("created_at")
        .in("status", waiting)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("publishing_attempts")
        .select("completed_at")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const lastRunAt = lastAttempt.data?.completed_at ?? null;
    return {
      workerRunning: lastRunAt ? Date.now() - new Date(lastRunAt).getTime() < 15 * 60 * 1000 : false,
      lastAttemptAt: lastRunAt,
      queuedJobCount: queued.count ?? 0,
      publishingJobCount: publishing.count ?? 0,
      failedJobCount: failed.count ?? 0,
      oldestQueuedJobAgeSeconds: oldest.data?.created_at
        ? Math.round((Date.now() - new Date(oldest.data.created_at).getTime()) / 1000)
        : null,
    };
  });

/** Live progress for one post: parent status plus every destination. */
export const getPublishingProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PublishingProgress | null> => {
    const { supabase } = context;
    const { data: post } = await supabase
      .from("social_posts")
      .select("id, status, scheduled_at_utc")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post) return null;

    const { data: job } = await supabase
      .from("publishing_jobs")
      .select("id")
      .eq("post_id", data.postId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: rows } = await supabase
      .from("social_post_destinations")
      .select(
        "id, platform, account_label, publish_status, provider_post_id, provider_post_url, error_message",
      )
      .eq("post_id", data.postId);

    const { data: jobRows } = job
      ? await supabase
          .from("publishing_job_destinations")
          .select("id, social_post_destination_id, attempt_count, max_attempts, next_retry_at")
          .eq("publishing_job_id", job.id)
      : { data: [] };

    const jobByDest = new Map((jobRows ?? []).map((r) => [r.social_post_destination_id, r]));
    const destinations: DestinationProgress[] = (rows ?? []).map((row) => {
      const jd = jobByDest.get(row.id);
      return {
        id: jd?.id ?? row.id,
        destinationId: row.id,
        platform: row.platform as SocialPlatform,
        accountLabel: row.account_label ?? row.platform,
        status: row.publish_status,
        attemptCount: jd?.attempt_count ?? 0,
        maxAttempts: jd?.max_attempts ?? 5,
        nextRetryAt: jd?.next_retry_at ?? null,
        providerPostId: row.provider_post_id,
        providerPostUrl: row.provider_post_url,
        errorMessage: row.error_message,
      };
    });

    return {
      jobId: job?.id ?? "",
      postId: post.id,
      status: post.status as PostStatus,
      scheduledFor: post.scheduled_at_utc,
      destinations,
      counts: {
        total: destinations.length,
        published: destinations.filter((d) => d.status === "published").length,
        failed: destinations.filter((d) => d.status === "failed" || d.status === "reconnect_required")
          .length,
        processing: destinations.filter((d) =>
          ["queued", "uploading", "processing", "retry_scheduled", "rate_limited"].includes(d.status),
        ).length,
      },
    };
  });

export type DestinationAttemptRow = {
  attemptNumber: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  durationMs: number | null;
  nextRetryAt: string | null;
  createdAt: string;
};

/**
 * Attempt-by-attempt history for one destination, so a failed upload can be read
 * back with its exact provider reason instead of a generic failure.
 */
export const listDestinationAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ destinationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<DestinationAttemptRow[]> => {
    const { data: jobDest } = await context.supabase
      .from("publishing_job_destinations")
      .select("id")
      .eq("social_post_destination_id", data.destinationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!jobDest) return [];

    const { data: rows, error } = await context.supabase
      .from("publishing_attempts")
      .select("attempt_number, status, error_code, error_message, retryable, duration_ms, next_retry_at, created_at")
      .eq("job_destination_id", jobDest.id)
      .order("attempt_number", { ascending: true });
    if (error) throw error;

    return (rows ?? []).map((row) => ({
      attemptNumber: row.attempt_number,
      status: row.status,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      retryable: row.retryable,
      durationMs: row.duration_ms,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
    }));
  });


/** Retries one failed destination immediately, leaving the others untouched. */
export const retryDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        destinationId: z.string().uuid(),
        /** Skip the media processor entirely and publish the original upload. */
        originalAudioOnly: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("publishing_job_destinations")
      .select("id, attempt_count, max_attempts")
      .eq("social_post_destination_id", data.destinationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new Error("That destination cannot be retried right now.");

    // "Retry with the original audio" removes the mix from this destination
    // only, so a media-processor outage stops blocking the upload.
    if (data.originalAudioOnly) {
      const { data: current } = await context.supabase
        .from("social_post_destinations")
        .select("platform_settings")
        .eq("id", data.destinationId)
        .maybeSingle();
      const settings = (current?.platform_settings ?? {}) as Record<string, unknown>;
      await context.supabase
        .from("social_post_destinations")
        .update({
          platform_settings: { ...settings, force_original_audio: true } as never,
        })
        .eq("id", data.destinationId);
    }

    // A destination that already burned all of its automatic attempts still needs
    // headroom, otherwise the worker/processor treats it as exhausted.
    const maxAttempts = Math.max(
      existing.max_attempts ?? 3,
      (existing.attempt_count ?? 0) + 1,
    );

    const { data: row, error } = await context.supabase
      .from("publishing_job_destinations")
      .update({
        status: "queued",
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
        max_attempts: maxAttempts,
      })
      .eq("id", existing.id)
      .in("status", ["failed", "retry_scheduled", "rate_limited", "reconnect_required", "processing", "uploading", "validating", "queued", "pending"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("That destination cannot be retried right now.");

    await context.supabase
      .from("social_post_destinations")
      .update({ publish_status: "queued", error_message: null })
      .eq("id", data.destinationId);

    const { processJobDestination } = await import("@/lib/publishing.server");
    const status = await processJobDestination(existing.id);

    // Surface the real, safe reason instead of a generic "rejected again".
    const { data: after } = await context.supabase
      .from("social_post_destinations")
      .select("error_code, error_message")
      .eq("id", data.destinationId)
      .maybeSingle();
    return {
      status,
      errorCode: after?.error_code ?? null,
      errorMessage: after?.error_message ?? null,
    };
  });

/** Cancels one queued destination without touching the rest of the post. */
export const cancelDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobDestinationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("publishing_job_destinations")
      .update({ status: "cancelled", next_retry_at: null })
      .eq("id", data.jobDestinationId)
      .in("status", ["pending", "queued", "retry_scheduled", "rate_limited", "failed"])
      .select("id, publishing_job_id, social_post_destination_id")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("That destination can no longer be cancelled.");

    await context.supabase
      .from("social_post_destinations")
      .update({ publish_status: "cancelled" })
      .eq("id", row.social_post_destination_id);

    const { data: dest } = await context.supabase
      .from("social_post_destinations")
      .select("post_id")
      .eq("id", row.social_post_destination_id)
      .maybeSingle();
    if (dest) {
      const { rollUpParentStatus } = await import("@/lib/publishing.server");
      await rollUpParentStatus(row.publishing_job_id, dest.post_id);
    }
    return { ok: true };
  });
