// The publishing engine: creates posts/destinations/jobs and processes one
// destination at a time so a failure on one account never blocks the others.
import type { SocialPlatform } from "@/lib/social-platforms";
import { MAX_PUBLISH_ATTEMPTS, nextRetryAtIso } from "@/lib/publishing-types";
import type { DestinationStatus, PostStatus } from "@/lib/publishing-types";
import { adapterFor } from "@/lib/provider-adapters/index.server";
import { ProviderError, sanitizeResponse } from "@/lib/provider-adapters/types";
import type { ProviderMedia, SocialAccountRecord } from "@/lib/provider-adapters/types";
import { loadCapabilities, validateDestination } from "@/lib/publishing-validation.server";
import type { ValidationSubject } from "@/lib/publishing-validation.server";
import { getValidAccessToken } from "@/lib/token-refresh.server";
import { classifyProviderError, isAuthRecoverable, safeReason } from "@/lib/provider-error-map";
import { classifyMedia, signedMediaUrl } from "@/lib/media-processing.server";
import { decryptToken } from "@/lib/token-crypto.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function logAudit(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  const supabase = await db();
  await supabase.from("admin_audit_logs").insert({
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    details: (entry.details ?? {}) as never,
  });
}

async function notify(entry: {
  userId: string;
  workspaceId: string;
  type: string;
  title: string;
  message: string;
  postId?: string;
  accountId?: string;
}) {
  const supabase = await db();
  await supabase.from("notifications").insert({
    user_id: entry.userId,
    workspace_id: entry.workspaceId,
    type: entry.type,
    title: entry.title,
    message: entry.message,
    post_id: entry.postId ?? null,
    social_account_id: entry.accountId ?? null,
  });
}

/** Rate-limit bucket check. Returns the time to wait, or null when clear. */
async function rateLimitedUntil(
  platform: SocialPlatform,
  accountId: string,
  perHour: number,
): Promise<string | null> {
  if (!perHour || perHour <= 0) return null;
  const supabase = await db();
  const bucketKey = `${platform}:${accountId}`;
  const { data: bucket } = await supabase
    .from("provider_rate_limits")
    .select("id, request_count, request_limit, resets_at")
    .eq("bucket_key", bucketKey)
    .maybeSingle();

  const now = Date.now();
  if (!bucket || new Date(bucket.resets_at).getTime() <= now) {
    await supabase.from("provider_rate_limits").upsert(
      {
        platform,
        social_account_id: accountId,
        bucket_key: bucketKey,
        window_started_at: new Date().toISOString(),
        request_count: 1,
        request_limit: perHour,
        resets_at: new Date(now + 3600_000).toISOString(),
      },
      { onConflict: "bucket_key" },
    );
    return null;
  }
  if (bucket.request_count >= bucket.request_limit) return bucket.resets_at;
  await supabase
    .from("provider_rate_limits")
    .update({ request_count: bucket.request_count + 1 })
    .eq("id", bucket.id);
  return null;
}

type LoadedDestination = {
  jobDestinationId: string;
  destinationId: string;
  jobId: string;
  workspaceId: string;
  postId: string;
  platform: SocialPlatform;
  accountConnectionId: string | null;
  attemptCount: number;
  maxAttempts: number;
  status: DestinationStatus;
  providerJobId: string | null;
  uploadSessionUrl: string | null;
  uploadBytes: number;
  youtubeVideoId: string | null;
};

async function loadJobDestination(jobDestinationId: string): Promise<LoadedDestination | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("publishing_job_destinations")
    .select(
      "id, publishing_job_id, social_post_destination_id, workspace_id, social_account_id, platform, status, attempt_count, max_attempts, youtube_upload_session, youtube_bytes_uploaded, youtube_video_id, social_post_destinations(post_id, provider_job_id)",
    )
    .eq("id", jobDestinationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const dest = (data as any).social_post_destinations;
  return {
    jobDestinationId: data.id,
    destinationId: data.social_post_destination_id,
    jobId: data.publishing_job_id,
    workspaceId: data.workspace_id,
    postId: dest?.post_id,
    platform: data.platform as SocialPlatform,
    accountConnectionId: data.social_account_id,
    attemptCount: data.attempt_count,
    maxAttempts: data.max_attempts,
    status: data.status as DestinationStatus,
    providerJobId: dest?.provider_job_id ?? null,
    uploadSessionUrl: (data as any).youtube_upload_session ?? null,
    uploadBytes: Number((data as any).youtube_bytes_uploaded ?? 0),
    youtubeVideoId: (data as any).youtube_video_id ?? null,
  };
}

/**
 * Durable resumable-upload state for one destination. Every save doubles as a
 * progress heartbeat, which is what keeps the stuck-job sweeper from timing out
 * a large upload that is still streaming.
 */
function makeUploadState(loaded: LoadedDestination) {
  const state = {
    sessionUrl: loaded.uploadSessionUrl,
    bytesUploaded: loaded.uploadBytes,
    videoId: loaded.youtubeVideoId,
    async save(patch: {
      sessionUrl?: string | null;
      bytesUploaded?: number;
      videoId?: string | null;
      startedAt?: string;
      completedAt?: string;
    }) {
      if (patch.sessionUrl !== undefined) state.sessionUrl = patch.sessionUrl;
      if (patch.bytesUploaded !== undefined) state.bytesUploaded = patch.bytesUploaded;
      if (patch.videoId !== undefined) state.videoId = patch.videoId;
      const supabase = await db();
      await supabase
        .from("publishing_job_destinations")
        .update({
          ...(patch.sessionUrl !== undefined ? { youtube_upload_session: patch.sessionUrl } : {}),
          ...(patch.bytesUploaded !== undefined
            ? { youtube_bytes_uploaded: patch.bytesUploaded }
            : {}),
          ...(patch.videoId !== undefined ? { youtube_video_id: patch.videoId } : {}),
          ...(patch.startedAt ? { upload_started_at: patch.startedAt } : {}),
          ...(patch.completedAt ? { upload_completed_at: patch.completedAt } : {}),
          last_progress_at: new Date().toISOString(),
        } as never)
        .eq("id", loaded.jobDestinationId);
    },
  };
  return state;
}

async function buildPublishInput(loaded: LoadedDestination) {
  const supabase = await db();
  const [{ data: post }, { data: destination }, { data: media }, { data: connection }] =
    await Promise.all([
      supabase
        .from("social_posts")
        .select("id, workspace_id, created_by, title, base_caption, base_description, base_hashtags, link_url, post_type")
        .eq("id", loaded.postId)
        .maybeSingle(),
      supabase
        .from("social_post_destinations")
        .select(
          "id, platform_caption, platform_title, platform_description, platform_hashtags, platform_settings, account_label",
        )
        .eq("id", loaded.destinationId)
        .maybeSingle(),
      supabase
        .from("social_post_media")
        .select("storage_path, thumbnail_path, media_type, mime_type, file_size, width, height, duration_seconds, aspect_ratio, alt_text")
        .eq("post_id", loaded.postId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle(),
      loaded.accountConnectionId
        ? supabase
            .from("social_connections")
            .select(
              "id, platform, account_id, account_name, username, scopes, metadata, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, connection_status, publishing_enabled, publishing_eligible, user_id",
            )
            .eq("id", loaded.accountConnectionId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (!post) throw new ProviderError("The post no longer exists.", { code: "post_missing" });
  if (!connection) {
    throw new ProviderError("This account needs to be reconnected.", { code: "account_disconnected" });
  }

  const hashtags = destination?.platform_hashtags ?? post.base_hashtags ?? [];
  const mediaType = classifyMedia(media?.mime_type ?? null);
  // Retries rebuild the payload from the stored upload and mint a brand new
  // signed URL, so an expired link never causes a failure on its own.
  const freshSignedUrl = media?.storage_path ? await signedMediaUrl(media.storage_path) : null;
  const thumbnailUrl = media?.thumbnail_path ? await signedMediaUrl(media.thumbnail_path) : null;
  if (media?.storage_path && !freshSignedUrl) {
    throw new ProviderError(
      "The uploaded video could no longer be read from storage. Re-upload the video on this post.",
      { code: "stored_media_unavailable", retryable: false },
    );
  }
  const providerMedia: ProviderMedia = {
    mediaType,
    mimeType: media?.mime_type ?? null,
    signedUrl: freshSignedUrl,
    thumbnailUrl,
    fileSize: Number(media?.file_size ?? 0),
    durationSeconds: media?.duration_seconds ? Number(media.duration_seconds) : null,
    width: media?.width ?? null,
    height: media?.height ?? null,
    altText: media?.alt_text ?? null,
  };

  const settings = (destination?.platform_settings ?? {}) as Record<string, unknown>;

  // Copyright-safe music: validate the licence for this platform and, when the
  // user chose a different soundtrack, publish a freshly rendered file. The
  // original upload is never overwritten.
  {
    const { resolveDestinationAudio, AudioRightsError, MediaProcessorError } = await import(
      "@/lib/audio-render.server"
    );
    try {
      const resolved = await resolveDestinationAudio({
        workspaceId: post.workspace_id,
        userId: post.created_by,
        platform: loaded.platform,
        accountLabel: destination?.account_label ?? connection.account_name,
        destinationId: loaded.destinationId,
        settings,
        descriptionText: `${destination?.platform_description ?? ""}\n${destination?.platform_caption ?? ""}`,
        media: {
          storagePath: media?.storage_path ?? null,
          mediaType,
          durationSeconds: media?.duration_seconds ? Number(media.duration_seconds) : null,
        },
        // Set by the "retry with the original audio" action: publish the
        // untouched upload without ever calling the media processor.
        forceOriginalAudio: settings["force_original_audio"] === true,
        postId: post.id,
        jobDestinationId: loaded.destinationId,
      });
      if (resolved.kind === "rendered") {
        providerMedia.signedUrl = resolved.signedUrl;
        // The mixed file has a different byte length than the upload; resumable
        // uploads (YouTube) would break with the stale size.
        const { statMediaObject } = await import("@/lib/media-processing.server");
        const stat = await statMediaObject(resolved.storagePath);
        if (stat && stat.size > 0) providerMedia.fileSize = stat.size;
      }
    } catch (error) {
      if (error instanceof AudioRightsError) {
        throw new ProviderError(error.message, { code: "music_rights_blocked", retryable: false });
      }
      // A worker outage or missing route is never a licence problem, and a 404
      // must not be retried forever. Other platforms are unaffected because
      // each destination is processed independently.
      if (error instanceof MediaProcessorError) {
        throw new ProviderError(error.message, {
          code: error.code,
          retryable: error.retryable,
        });
      }
      throw error;
    }
  }

  const account: SocialAccountRecord = {
    id: connection.id,
    platform: connection.platform as SocialPlatform,
    accountId: connection.account_id,
    accountName: connection.account_name,
    username: connection.username,
    scopes: connection.scopes ?? [],
    metadata: (connection.metadata ?? {}) as Record<string, unknown>,
    accessToken: decryptToken(connection.access_token_ciphertext),
    refreshToken: connection.refresh_token_ciphertext
      ? decryptToken(connection.refresh_token_ciphertext)
      : null,
    tokenExpiresAt: connection.token_expires_at,
  };

  const subject: ValidationSubject = {
    destinationId: loaded.destinationId,
    platform: loaded.platform,
    accountId: connection.id,
    accountLabel: destination?.account_label ?? connection.account_name,
    accountScopes: connection.scopes ?? [],
    accountConnected: connection.connection_status !== "disconnected",
    tokenExpiresAt: connection.token_expires_at,
    publishingEnabled: connection.publishing_enabled,
    publishingEligible: connection.publishing_eligible,
    title: destination?.platform_title ?? post.title,
    caption: destination?.platform_caption ?? post.base_caption,
    description: destination?.platform_description ?? post.base_description,
    hashtags,
    linkUrl: post.link_url,
    settings,
    media: {
      mediaType,
      mimeType: media?.mime_type ?? null,
      fileSize: Number(media?.file_size ?? 0),
      durationSeconds: media?.duration_seconds ? Number(media.duration_seconds) : null,
      aspectRatio: media?.aspect_ratio ? Number(media.aspect_ratio) : null,
    },
  };

  return {
    ownerId: post.created_by,
    workspaceId: post.workspace_id,
    subject,
    account,
    publishInput: {
      account,
      title: subject.title,
      caption: subject.caption,
      description: subject.description,
      hashtags,
      linkUrl: post.link_url,
      media: providerMedia,
      settings,
      idempotencyKey: `${loaded.destinationId}:${loaded.attemptCount + 1}`,
      jobDestinationId: loaded.jobDestinationId,
      ownerId: post.created_by,
      attemptNumber: loaded.attemptCount + 1,
      uploadState: makeUploadState(loaded),
    },
  };
}

async function finishDestination(
  loaded: LoadedDestination,
  update: {
    status: DestinationStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    providerPostId?: string | null;
    providerPostUrl?: string | null;
    providerJobId?: string | null;
    nextRetryAt?: string | null;
  },
) {
  const supabase = await db();
  await supabase
    .from("publishing_job_destinations")
    .update({
      status: update.status,
      last_error_code: update.errorCode ?? null,
      last_error_message: update.errorMessage ?? null,
      next_retry_at: update.nextRetryAt ?? null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", loaded.jobDestinationId);

  await supabase
    .from("social_post_destinations")
    .update({
      publish_status: update.status,
      error_code: update.errorCode ?? null,
      error_message: update.errorMessage ?? null,
      provider_post_id: update.providerPostId ?? null,
      provider_post_url: update.providerPostUrl ?? null,
      provider_job_id: update.providerJobId ?? null,
      ...(update.status === "published" ? { published_at: new Date().toISOString() } : {}),
    })
    .eq("id", loaded.destinationId);

  await rollUpParentStatus(loaded.jobId, loaded.postId);
}

/** Derives a post-level status from the statuses of its selected targets. */
export function derivePostStatus(statuses: DestinationStatus[]): PostStatus | null {
  if (statuses.length === 0) return null;
  const published = statuses.filter((s) => s === "published").length;
  const failed = statuses.filter((s) => s === "failed" || s === "reconnect_required").length;
  const cancelled = statuses.filter((s) => s === "cancelled").length;
  // Snapchat Creative Kit shares are complete on our side and waiting on the
  // user — settled, but never counted as a failure.
  const actionRequired = statuses.filter((s) => s === "action_required").length;
  const settled = published + failed + cancelled + actionRequired;

  let status: PostStatus;
  if (settled < statuses.length) status = "publishing";
  else if (published === statuses.length) status = "published";
  else if (failed === 0 && cancelled === 0 && actionRequired > 0) status = "requires_attention";
  else if (published > 0) status = "partially_published";
  else if (cancelled === statuses.length) status = "cancelled";
  else status = "failed";
  return status;
}

/** Recomputes the parent post/job status from its destinations. */
export async function rollUpParentStatus(jobId: string, postId: string) {
  const supabase = await db();
  const { data: rows } = await supabase
    .from("publishing_job_destinations")
    .select("status")
    .eq("publishing_job_id", jobId);
  const statuses = (rows ?? []).map((r) => r.status as DestinationStatus);
  const status = derivePostStatus(statuses);
  if (!status) return;

  const completed = status !== "publishing";
  await supabase
    .from("publishing_jobs")
    .update({ status, ...(completed ? { completed_at: new Date().toISOString() } : {}) })
    .eq("id", jobId);

  // The post's own status is derived from every selected target for that post,
  // never from a single job, so a retry job can't leave the post on
  // "Publishing" while all targets are settled.
  const { data: postRows } = await supabase
    .from("social_post_destinations")
    .select("publish_status")
    .eq("post_id", postId);
  const postStatus = derivePostStatus(
    (postRows ?? []).map((r) => r.publish_status as DestinationStatus),
  );
  if (postStatus) await supabase.from("social_posts").update({ status: postStatus }).eq("id", postId);
}

/**
 * Publishes a single destination. Records one attempt row, decides retryability,
 * and schedules exponential backoff for transient provider failures.
 */
export async function processJobDestination(jobDestinationId: string): Promise<DestinationStatus> {
  const supabase = await db();
  const loaded = await loadJobDestination(jobDestinationId);
  if (!loaded) return "cancelled";
  if (loaded.status === "cancelled") return "cancelled";

  const attemptNumber = loaded.attemptCount + 1;
  // Hard cap: at most three automatic attempts, whatever the platform config says.
  const attemptCap = Math.min(loaded.maxAttempts || MAX_PUBLISH_ATTEMPTS, MAX_PUBLISH_ATTEMPTS);
  const startedAt = new Date();
  await supabase
    .from("publishing_job_destinations")
    .update({
      status: "uploading",
      attempt_count: attemptNumber,
      last_progress_at: new Date().toISOString(),
    } as never)
    .eq("id", jobDestinationId);
  // Mirror the in-flight state so Post History shows "Uploading" immediately
  // instead of leaving the target on "Queued" for the whole upload.
  await supabase
    .from("social_post_destinations")
    .update({ publish_status: "uploading" })
    .eq("id", loaded.destinationId);
  const logCtx = {
    post_id: loaded.postId,
    job_id: loaded.jobId,
    job_destination_id: jobDestinationId,
    platform: loaded.platform,
    attempt: attemptNumber,
  };
  console.info("[PUBLISH_JOB_STARTED]", JSON.stringify(logCtx));

  const recordAttempt = async (
    status: DestinationStatus,
    extra: {
      errorCode?: string | null;
      errorMessage?: string | null;
      retryable?: boolean;
      safeResponse?: Record<string, unknown> | null;
      safeRequest?: Record<string, unknown> | null;
      nextRetryAt?: string | null;
    } = {},
  ) => {
    await supabase.from("publishing_attempts").insert({
      job_destination_id: jobDestinationId,
      workspace_id: loaded.workspaceId,
      attempt_number: attemptNumber,
      status,
      safe_request_payload: (extra.safeRequest ?? null) as never,
      safe_provider_response: (extra.safeResponse ?? null) as never,
      error_code: extra.errorCode ?? null,
      error_message: extra.errorMessage ?? null,
      retryable: extra.retryable ?? false,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      next_retry_at: extra.nextRetryAt ?? null,
    });
  };

  /**
   * A permanent failure (missing Page, revoked token, unsupported media) is a
   * configuration problem, not a delivery attempt: it must never consume one of
   * the three automatic attempts, otherwise "Retry" stops working after two
   * clicks even though nothing was ever uploaded.
   */
  const refundAttempt = async () => {
    await supabase
      .from("publishing_job_destinations")
      .update({ attempt_count: loaded.attemptCount })
      .eq("id", jobDestinationId);
  };

  try {
    const context = await buildPublishInput(loaded);
    const capabilities = await loadCapabilities();
    const capability = capabilities[loaded.platform];

    // Revalidate right before publishing: rules, account and media may have changed.
    const validation = validateDestination(context.subject, capability);
    await supabase
      .from("social_post_destinations")
      .update({
        validation_status: validation.status,
        validation_issues: validation.issues as never,
      })
      .eq("id", loaded.destinationId);

    if (validation.status === "blocked") {
      const first = validation.issues.find((i) => !i.canAutoFix);
      const reconnect = first?.code === "account_disconnected" || first?.code === "token_expired";
      await recordAttempt(reconnect ? "reconnect_required" : "failed", {
        errorCode: first?.code ?? "validation_failed",
        errorMessage: first?.message ?? "This destination cannot be published.",
        retryable: false,
        safeRequest: { platform: loaded.platform, validation: validation.issues },
      });
      await finishDestination(loaded, {
        status: reconnect ? "reconnect_required" : "failed",
        errorCode: first?.code ?? "validation_failed",
        errorMessage: first?.message ?? "This destination cannot be published.",
      });
      await refundAttempt();
      return reconnect ? "reconnect_required" : "failed";
    }

    // Refresh the token if it is close to expiry.
    const refresh = await getValidAccessToken(context.account.id);
    if (!refresh.ok) {
      const status: DestinationStatus = refresh.reconnectRequired ? "reconnect_required" : "retry_scheduled";
      const nextRetryAt =
        refresh.reconnectRequired || attemptNumber >= attemptCap ? null : nextRetryAtIso(attemptNumber);
      await recordAttempt(status, {
        errorCode: refresh.code,
        errorMessage: refresh.message,
        retryable: !refresh.reconnectRequired,
        nextRetryAt,
        safeRequest: { platform: loaded.platform, operation: "token_refresh" },
      });
      await finishDestination(loaded, {
        status,
        errorCode: refresh.code,
        errorMessage: refresh.message,
        nextRetryAt,
      });
      if (refresh.reconnectRequired) await refundAttempt();
      return status;
    }
    context.publishInput.account.accessToken = refresh.accessToken;

    // Provider rate limit bucket.
    const perHour = Number(capability?.rate_limit_config?.["per_hour"] ?? 0);
    const waitUntil = await rateLimitedUntil(loaded.platform, context.account.id, perHour);
    if (waitUntil) {
      await recordAttempt("rate_limited", {
        errorCode: "rate_limited",
        errorMessage: "Publishing is delayed because the platform rate limit was reached.",
        retryable: true,
        nextRetryAt: waitUntil,
      });
      await supabase
        .from("publishing_job_destinations")
        .update({ attempt_count: loaded.attemptCount })
        .eq("id", jobDestinationId);
      await finishDestination(loaded, {
        status: "rate_limited",
        errorCode: "rate_limited",
        errorMessage: "Publishing is delayed because the platform rate limit was reached.",
        nextRetryAt: waitUntil,
      });
      return "rate_limited";
    }

    const adapter = adapterFor(loaded.platform);
    console.info(
      "[MEDIA_FOUND]",
      JSON.stringify({
        ...logCtx,
        media_type: context.publishInput.media.mediaType,
        file_size: context.publishInput.media.fileSize,
        has_url: Boolean(context.publishInput.media.signedUrl),
      }),
    );
    console.info("[PROVIDER_UPLOAD_STARTED]", JSON.stringify(logCtx));
    let result = await adapter.publish(context.publishInput);

    // Creative-Kit style outcomes: prepared, stored and waiting on the user.
    // Never an attempt, never a failure.
    if (result.status === "requires_user_action") {
      const code = result.userAction?.code ?? "manual_share_required";
      const message = result.userAction?.message ?? "This post is ready to share from the app.";
      await recordAttempt("action_required", {
        errorCode: code,
        errorMessage: message,
        retryable: false,
        safeResponse: { ...(result.rawResponseSafe ?? {}), platform: loaded.platform },
      });
      await finishDestination(loaded, {
        status: "action_required",
        errorCode: code,
        errorMessage: message,
      });
      await refundAttempt();
      return "action_required";
    }

    // Exactly one token refresh + one replay per publishing attempt. Never a loop.
    if (result.status === "failed") {
      const firstPass = classifyProviderError({
        code: result.errorCode ?? null,
        httpStatus: Number(result.rawResponseSafe?.["http_status"] ?? 0) || null,
        message: result.errorMessage ?? null,
      });
      if (isAuthRecoverable(firstPass.code)) {
        const renewed = await getValidAccessToken(context.account.id, { force: true });
        if (renewed.ok) {
          context.publishInput.account.accessToken = renewed.accessToken;
          result = await adapter.publish(context.publishInput);
        }
      }
    }

    if (result.status === "failed") {
      const classified = classifyProviderError({
        code: result.errorCode ?? null,
        httpStatus: Number(result.rawResponseSafe?.["http_status"] ?? 0) || null,
        message: result.errorMessage ?? null,
      });
      console.error(
        "[PROVIDER_UPLOAD_FAILED]",
        JSON.stringify({ ...logCtx, error_code: classified.code }),
      );
      const retryable = classified.retryable && attemptNumber < attemptCap;
      const status: DestinationStatus = classified.requiresReconnect
        ? "reconnect_required"
        : retryable
          ? "retry_scheduled"
          : "failed";
      const nextRetryAt = retryable ? nextRetryAtIso(attemptNumber) : null;
      await recordAttempt(status, {
        errorCode: classified.code,
        errorMessage: classified.reason,
        retryable,
        safeResponse: {
          ...(result.rawResponseSafe ?? {}),
          platform: loaded.platform,
          provider_code: result.errorCode ?? null,
          action: classified.action,
          retryable,
        },
        nextRetryAt,
      });
      await finishDestination(loaded, {
        status,
        errorCode: classified.code,
        errorMessage: classified.reason,
        nextRetryAt,
      });
      if (!classified.retryable) await refundAttempt();
      return status;
    }

    if (result.status === "processing") {
      const nextRetryAt = new Date(Date.now() + 60_000).toISOString();
      await recordAttempt("processing", {
        retryable: true,
        safeResponse: result.rawResponseSafe ?? null,
        nextRetryAt,
      });
      await supabase
        .from("publishing_job_destinations")
        .update({ attempt_count: loaded.attemptCount })
        .eq("id", jobDestinationId);
      await finishDestination(loaded, {
        status: "processing",
        providerPostId: result.providerPostId ?? null,
        providerPostUrl: result.providerPostUrl ?? null,
        providerJobId: result.providerJobId ?? null,
        nextRetryAt,
      });
      return "processing";
    }

    await recordAttempt("published", { safeResponse: result.rawResponseSafe ?? null });
    console.info(
      "[PROVIDER_UPLOAD_SUCCESS]",
      JSON.stringify({ ...logCtx, provider_post_id: result.providerPostId ?? null }),
    );
    await finishDestination(loaded, {
      status: "published",
      providerPostId: result.providerPostId ?? null,
      providerPostUrl: result.providerPostUrl ?? null,
    });
    await supabase
      .from("social_connections")
      .update({ last_successful_publish_at: new Date().toISOString() })
      .eq("id", context.account.id);
    await notify({
      userId: context.ownerId,
      workspaceId: context.workspaceId,
      type: "post_published",
      title: "Post published",
      message: `Your post went live on ${loaded.platform}.`,
      postId: loaded.postId,
      accountId: context.account.id,
    });
    return "published";
  } catch (cause) {
    const providerError = cause instanceof ProviderError ? cause : null;
    const rawMessage = providerError?.message ?? (cause instanceof Error ? cause.message : "");
    const safeRaw = providerError ? sanitizeResponse(providerError.safeResponse) : {};
    const classified = classifyProviderError({
      code: providerError?.code ?? null,
      httpStatus: Number(safeRaw["http_status"] ?? 0) || null,
      message: rawMessage,
    });
    const message = safeReason(classified.reason, "Publishing failed. Please try again.");
    const retryable = classified.retryable && attemptNumber < attemptCap;
    const nextRetryAt = retryable ? nextRetryAtIso(attemptNumber) : null;
    const manualShare = classified.action === "finish_in_snapchat";
    const status: DestinationStatus = manualShare
      ? "action_required"
      : classified.requiresReconnect
        ? "reconnect_required"
        : retryable
          ? "retry_scheduled"
          : "failed";

    if (!providerError) console.error("[publish] unexpected failure", cause);
    await recordAttempt(status, {
      errorCode: classified.code,
      errorMessage: message,
      retryable,
      safeResponse: { ...safeRaw, platform: loaded.platform, action: classified.action, retryable },
      nextRetryAt,
    });
    await finishDestination(loaded, { status, errorCode: classified.code, errorMessage: message, nextRetryAt });
    if (!classified.retryable) await refundAttempt();
    return status;
  }
}

/** Polls a destination that the provider is still processing. */
export async function pollProcessingDestination(jobDestinationId: string): Promise<DestinationStatus> {
  const loaded = await loadJobDestination(jobDestinationId);
  if (!loaded || !loaded.providerJobId) return "failed";
  const adapter = adapterFor(loaded.platform);
  if (!adapter.getStatus) return processJobDestination(jobDestinationId);

  try {
    const context = await buildPublishInput(loaded);
    const refresh = await getValidAccessToken(context.account.id);
    if (refresh.ok) context.account.accessToken = refresh.accessToken;
    const status = await adapter.getStatus(context.account, loaded.providerJobId);
    if (status.status === "processing") {
      await finishDestination(loaded, {
        status: "processing",
        providerJobId: loaded.providerJobId,
        nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      });
      return "processing";
    }
    if (status.status === "failed") {
      await finishDestination(loaded, {
        status: "failed",
        errorCode: "provider_processing_failed",
        errorMessage: status.errorMessage ?? "The platform could not process this media.",
      });
      return "failed";
    }
    await finishDestination(loaded, {
      status: "published",
      providerPostId: status.providerPostId ?? null,
      providerPostUrl: status.providerPostUrl ?? null,
    });
    return "published";
  } catch (cause) {
    const message = cause instanceof ProviderError ? cause.message : "Could not check publishing status.";
    await finishDestination(loaded, {
      status: "retry_scheduled",
      errorCode: "status_check_failed",
      errorMessage: message,
      providerJobId: loaded.providerJobId,
      nextRetryAt: new Date(Date.now() + 120_000).toISOString(),
    });
    return "retry_scheduled";
  }
}
