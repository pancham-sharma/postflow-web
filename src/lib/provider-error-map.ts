// Centralised provider-error classification. Client-safe: no secrets, no tokens,
// no provider payloads — only codes, safe reasons and the action a user can take.

export type FailureAction =
  | "reconnect_account"
  | "reconnect_and_grant_permission"
  | "refresh_token_then_retry_once"
  | "convert_or_replace_video"
  | "retry_original_audio_only"
  | "finish_in_snapchat"
  | "select_facebook_page"
  | "replace_stored_video"
  | "fix_backend_configuration"
  | "switch_account_type"
  | "wait_and_retry"
  | "retry_now"
  | "none";

/**
 * Which stage of the pipeline failed. Each stage is independent: a media stage
 * failure never means the account is broken, and an auth failure never means
 * the video is invalid.
 */
export type PublishStage =
  | "validation"
  | "media_processing"
  | "authorization"
  | "upload"
  | "publish";

export const PUBLISH_STAGE_LABEL: Record<PublishStage, string> = {
  validation: "Validation",
  media_processing: "Media processing",
  authorization: "Account authorization",
  upload: "Upload",
  publish: "Publish",
};

export type ErrorClassification = {
  /** Normalised, stable error code stored on the attempt. */
  code: string;
  retryable: boolean;
  /** Safe, human reason shown to the user. */
  reason: string;
  action: FailureAction;
  /** True when the account itself must be re-authorised before anything works. */
  requiresReconnect: boolean;
};

/** Permanent provider/OAuth codes: never queued for retry. */
const PERMANENT: Record<string, { code: string; reason: string; action: FailureAction; reconnect?: boolean }> = {
  invalid_client: { code: "invalid_client", reason: "The app credentials for this platform are invalid.", action: "fix_backend_configuration" },
  invalid_grant: { code: "token_revoked", reason: "The authorization was revoked or has expired.", action: "reconnect_account", reconnect: true },
  invalid_redirect_uri: { code: "invalid_redirect_uri", reason: "The configured redirect URL does not match the platform app.", action: "fix_backend_configuration" },
  access_denied: { code: "access_denied", reason: "Access to this account was denied by the platform.", action: "reconnect_account", reconnect: true },
  insufficient_scope: { code: "insufficient_permission", reason: "A required publishing permission is missing.", action: "reconnect_and_grant_permission", reconnect: true },
  insufficient_permission: { code: "insufficient_permission", reason: "A required publishing permission is missing.", action: "reconnect_and_grant_permission", reconnect: true },
  missing_permission: { code: "insufficient_permission", reason: "A required publishing permission is missing.", action: "reconnect_and_grant_permission", reconnect: true },
  token_expired: { code: "token_expired", reason: "The stored authorization expired and could not be renewed.", action: "reconnect_account", reconnect: true },
  access_token_expired: { code: "access_token_expired", reason: "The access token expired.", action: "refresh_token_then_retry_once", reconnect: false },
  token_refresh_failed: { code: "token_refresh_failed", reason: "The authorization could not be renewed automatically.", action: "reconnect_account", reconnect: true },
  refresh_token_revoked: { code: "token_revoked", reason: "The refresh permission was revoked by the platform.", action: "reconnect_account", reconnect: true },
  refresh_token_missing: { code: "refresh_token_missing", reason: "No long-lived authorization is stored for this account.", action: "reconnect_account", reconnect: true },
  account_disconnected: { code: "account_disconnected", reason: "This account is no longer connected.", action: "reconnect_account", reconnect: true },
  unsupported_media: { code: "unsupported_media", reason: "The platform rejected this video format.", action: "convert_or_replace_video" },
  unsupported_media_type: { code: "unsupported_media", reason: "The platform rejected this media type.", action: "convert_or_replace_video" },
  invalid_video_format: { code: "unsupported_media", reason: "The video encoding is not accepted by this platform.", action: "convert_or_replace_video" },
  music_rights_blocked: { code: "music_rights_blocked", reason: "The selected soundtrack is not licensed for this platform.", action: "convert_or_replace_video" },
  trial_access_pending: { code: "trial_access_pending", reason: "The platform app is still in trial access and cannot publish yet.", action: "fix_backend_configuration" },
  app_review_required: { code: "app_review_required", reason: "The platform requires app review before publishing is allowed.", action: "fix_backend_configuration" },
  publishing_not_supported: { code: "publishing_not_supported", reason: "This account type cannot publish through the platform API.", action: "switch_account_type" },
  personal_profile_publishing: { code: "publishing_not_supported", reason: "Personal profiles cannot publish through the API.", action: "switch_account_type" },
  missing_page_id: { code: "missing_page_id", reason: "No Facebook Page is selected for this connection. Choose the Page you publish to.", action: "select_facebook_page", reconnect: false },
  missing_instagram_account: { code: "missing_instagram_account", reason: "No Instagram professional account is linked to this connection.", action: "reconnect_and_grant_permission", reconnect: true },
  provider_endpoint_not_found: { code: "provider_endpoint_not_found", reason: "The platform endpoint used for this upload does not exist.", action: "fix_backend_configuration" },
  validation_failed: { code: "validation_failed", reason: "This destination did not pass pre-publish validation.", action: "none" },
  post_missing: { code: "post_missing", reason: "The post no longer exists.", action: "none" },
  // Media processing stage — the account and the post are fine; only the mix failed.
  media_processor_not_configured: { code: "media_processor_not_configured", reason: "Background music needs the media processor, which is not configured.", action: "retry_original_audio_only" },
  media_processor_route_not_found: { code: "media_processor_route_not_found", reason: "The media processor has no mixing route available.", action: "retry_original_audio_only" },
  media_processor_invalid_plan: { code: "media_processor_invalid_plan", reason: "The audio mix could not be built for this video.", action: "retry_original_audio_only" },
  missing_music_source: { code: "missing_music_source", reason: "No music source was available for this mix.", action: "retry_original_audio_only" },
  media_processor_invalid_input: { code: "media_processor_invalid_input", reason: "The media processor rejected the mix settings.", action: "retry_original_audio_only" },
  // Platform-specific publishing rules.
  facebook_video_permission_missing: { code: "facebook_video_permission_missing", reason: "This Facebook Page has not granted video publishing permission.", action: "reconnect_and_grant_permission", reconnect: true },
  facebook_publish_permission_missing: { code: "facebook_publish_permission_missing", reason: "This Facebook login has not granted Page content publishing (pages_manage_posts).", action: "reconnect_and_grant_permission", reconnect: true },
  facebook_page_not_found: { code: "facebook_page_not_found", reason: "The selected Facebook Page is not available to the connected login.", action: "select_facebook_page", reconnect: false },
  facebook_page_token_missing: { code: "facebook_page_token_missing", reason: "No Page access token is stored for this Facebook connection. Select the Page again to store one.", action: "select_facebook_page", reconnect: false },
  stored_media_unavailable: { code: "stored_media_unavailable", reason: "The uploaded video could no longer be read from storage. Upload the video again on this post.", action: "replace_stored_video" },
  media_unavailable: { code: "media_unavailable", reason: "The video file for this post is unavailable.", action: "replace_stored_video" },
  instagram_not_professional: { code: "instagram_not_professional", reason: "Only Instagram Business or Creator accounts can publish through the API.", action: "switch_account_type" },
  snapchat_manual_share_required: { code: "snapchat_manual_share_required", reason: "Your video is ready. Open Snapchat to finish sharing it to your Story, Spotlight, or friends.", action: "finish_in_snapchat" },
  snapchat_public_profile_unavailable: { code: "snapchat_public_profile_unavailable", reason: "Automatic Snapchat publishing is not enabled for this connection. You can still share the video through Snapchat.", action: "finish_in_snapchat" },
};

/** Temporary codes: safe to retry with backoff. */
const TEMPORARY: Record<string, { code: string; reason: string }> = {
  network_error: { code: "network_error", reason: "The platform could not be reached." },
  timeout: { code: "network_timeout", reason: "The platform timed out." },
  dns_failure: { code: "network_error", reason: "The platform host could not be resolved temporarily." },
  rate_limited: { code: "provider_rate_limited", reason: "The platform rate limit was reached." },
  provider_unavailable: { code: "provider_unavailable", reason: "The platform is temporarily unavailable." },
  media_processing_delay: { code: "media_processing_delay", reason: "The platform is still processing the upload." },
  media_processor_unavailable: { code: "media_processor_unavailable", reason: "The media processor is temporarily unavailable." },
  media_processor_unreachable: { code: "media_processor_unreachable", reason: "The media processor could not be reached." },
  media_processor_output_missing: { code: "media_processor_output_missing", reason: "The mixed video was not written back in time." },
  media_processor_timeout: { code: "media_processor_timeout", reason: "Media processing is taking longer than expected." },
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405, 409, 410, 415, 422]);

function statusReason(status: number): { code: string; reason: string; action: FailureAction; reconnect: boolean } {
  switch (status) {
    case 401:
      return { code: "token_expired", reason: "The platform rejected the stored authorization.", action: "reconnect_account", reconnect: true };
    case 403:
      return { code: "insufficient_permission", reason: "The platform denied permission for this action.", action: "reconnect_and_grant_permission", reconnect: true };
    case 404:
      return { code: "provider_endpoint_not_found", reason: "The platform could not find the target endpoint or resource.", action: "fix_backend_configuration", reconnect: false };
    case 415:
      return { code: "unsupported_media", reason: "The platform rejected this media type.", action: "convert_or_replace_video", reconnect: false };
    case 429:
      return { code: "provider_rate_limited", reason: "The platform rate limit was reached.", action: "wait_and_retry", reconnect: false };
    default:
      if (RETRYABLE_STATUS.has(status)) {
        return { code: "provider_unavailable", reason: `The platform temporarily returned HTTP ${status}.`, action: "wait_and_retry", reconnect: false };
      }
      return { code: `provider_http_${status}`, reason: `The platform rejected the request (HTTP ${status}).`, action: "none", reconnect: false };
  }
}

const AUTH_TEXT = /(expired|invalid[_ ]?token|oauthexception|revok|reauthenticat|session has been invalidated|not authorized)/i;
const PERMISSION_TEXT = /(permission|scope|not authoriz|insufficient)/i;
const MEDIA_TEXT = /(unsupported|codec|format|aspect ratio|too (large|long|short)|resolution)/i;

/**
 * Maps any provider failure to a stable code, a retry decision and the action a
 * user can actually take. Retry is opt-in: unknown failures are NOT retried.
 */
export function classifyProviderError(input: {
  code?: string | null;
  httpStatus?: number | null;
  message?: string | null;
}): ErrorClassification {
  const rawCode = (input.code ?? "").toString().trim().toLowerCase();
  const message = (input.message ?? "").trim();

  // http_<status> style codes carry their status inline.
  const inlineStatus = /^http_(\d{3})$/.exec(rawCode);
  const httpStatus = input.httpStatus ?? (inlineStatus ? Number(inlineStatus[1]) : null);

  const permanent = PERMANENT[rawCode];
  if (permanent) {
    return {
      code: permanent.code,
      retryable: false,
      reason: message && permanent.code === "music_rights_blocked" ? message : permanent.reason,
      action: permanent.action,
      requiresReconnect: permanent.reconnect ?? false,
    };
  }

  const temporary = TEMPORARY[rawCode];
  if (temporary) {
    return {
      code: temporary.code,
      retryable: true,
      reason: temporary.reason,
      action: "wait_and_retry",
      requiresReconnect: false,
    };
  }

  // media_processor_http_524 / _502 / _504: the mixing worker (or the proxy in
  // front of it) gave up. Always temporary — never a reason to fail the post.
  const processorStatus = /^media_processor_http_(\d{3})$/.exec(rawCode);
  if (processorStatus) {
    const status = Number(processorStatus[1]);
    if (status >= 500 || status === 408 || status === 429) {
      return {
        code: "media_processor_timeout",
        retryable: true,
        reason:
          status === 524 || status === 504 || status === 408
            ? "Media processing timed out. It will be retried automatically."
            : "The media processor is temporarily unavailable.",
        action: "wait_and_retry",
        requiresReconnect: false,
      };
    }
  }
  if (rawCode === "media_source_video_missing" || rawCode === "media_source_video_invalid") {
    return {
      code: rawCode,
      retryable: false,
      reason: "The uploaded video is missing or unreadable in storage. Re-upload the video.",
      action: "convert_or_replace_video",
      requiresReconnect: false,
    };
  }

  if (httpStatus) {
    const byStatus = statusReason(httpStatus);
    const retryable = RETRYABLE_STATUS.has(httpStatus) && !PERMANENT_STATUS.has(httpStatus);
    // A 400 that is really an auth problem must require reconnection, not retry.
    if (httpStatus === 400 && AUTH_TEXT.test(message)) {
      return { code: "token_expired", retryable: false, reason: "The platform rejected the stored authorization.", action: "reconnect_account", requiresReconnect: true };
    }
    return {
      code: byStatus.code,
      retryable,
      reason: message && !retryable ? safeReason(message, byStatus.reason) : byStatus.reason,
      action: byStatus.action,
      requiresReconnect: byStatus.reconnect,
    };
  }

  if (AUTH_TEXT.test(message)) {
    return { code: "token_expired", retryable: false, reason: "The platform rejected the stored authorization.", action: "reconnect_account", requiresReconnect: true };
  }
  if (PERMISSION_TEXT.test(message)) {
    return { code: "insufficient_permission", retryable: false, reason: "A required publishing permission is missing.", action: "reconnect_and_grant_permission", requiresReconnect: true };
  }
  if (MEDIA_TEXT.test(message)) {
    return { code: "unsupported_media", retryable: false, reason: safeReason(message, "The platform rejected this media."), action: "convert_or_replace_video", requiresReconnect: false };
  }

  return {
    code: rawCode || "provider_failed",
    retryable: false,
    reason: safeReason(message, "The platform rejected this upload."),
    action: "none",
    requiresReconnect: false,
  };
}

/** Truncates and strips anything credential-shaped out of a provider message. */
export function safeReason(message: string, fallback: string): string {
  if (!message) return fallback;
  const cleaned = message
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .replace(/(access|refresh|bearer)[_ ]?token[^\s,;]*/gi, "[redacted]")
    .trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}…` : cleaned || fallback;
}

/** Codes whose right move is: refresh the token once, then retry the call once. */
export function isAuthRecoverable(code: string): boolean {
  return code === "access_token_expired" || code === "token_expired";
}

export const FAILURE_ACTION_LABEL: Record<FailureAction, string> = {
  reconnect_account: "Reconnect account",
  reconnect_and_grant_permission: "Reconnect and grant permission",
  refresh_token_then_retry_once: "Renew authorization and retry",
  convert_or_replace_video: "Convert or replace the video",
  retry_original_audio_only: "Retry with the original audio",
  finish_in_snapchat: "Share from the Snapchat app",
  select_facebook_page: "Choose the Facebook Page to publish to",
  replace_stored_video: "Re-upload or replace the video",
  fix_backend_configuration: "Fix the platform app configuration",
  switch_account_type: "Switch to a Business or Creator account",
  wait_and_retry: "Wait and retry",
  retry_now: "Retry now",
  none: "Review the post",
};

/** Infers which pipeline stage produced a normalised error code. */
export function stageForCode(code: string | null | undefined): PublishStage {
  const value = (code ?? "").toLowerCase();
  if (!value) return "publish";
  if (value.startsWith("media_processor") || value === "missing_music_source" || value === "music_rights_blocked") {
    return "media_processing";
  }
  if (value === "validation_failed" || value === "post_missing" || value.startsWith("media_")) {
    return "validation";
  }
  if (
    value.includes("token") ||
    value.includes("permission") ||
    value.includes("scope") ||
    value === "account_disconnected" ||
    value === "access_denied" ||
    value === "invalid_client"
  ) {
    return "authorization";
  }
  if (value === "unsupported_media" || value === "media_unavailable") return "upload";
  return "publish";
}
