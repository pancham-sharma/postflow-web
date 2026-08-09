// Client-safe Snapchat error codes and the copy shown to users.
// Server code raises these codes; the UI renders the matching message.
export const SNAPCHAT_ERROR_CODES = [
  "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE",
  "SNAPCHAT_PUBLIC_PROFILE_NOT_FOUND",
  "SNAPCHAT_PERMISSION_MISSING",
  "SNAPCHAT_TOKEN_EXPIRED",
  "SNAPCHAT_TOKEN_REFRESH_FAILED",
  "SNAPCHAT_VIDEO_NOT_FOUND",
  "SNAPCHAT_VIDEO_UNSUPPORTED",
  "SNAPCHAT_VIDEO_TOO_LARGE",
  "SNAPCHAT_MEDIA_UPLOAD_FAILED",
  "SNAPCHAT_MEDIA_PROCESSING_FAILED",
  "SNAPCHAT_MEDIA_PROCESSING_TIMEOUT",
  "SNAPCHAT_CONTENT_CREATE_FAILED",
  "SNAPCHAT_PUBLISH_FAILED",
  "SNAPCHAT_RATE_LIMITED",
  "SNAPCHAT_RECONNECT_REQUIRED",
] as const;

export type SnapchatErrorCode = (typeof SNAPCHAT_ERROR_CODES)[number];

export const SNAPCHAT_ERROR_MESSAGES: Record<SnapchatErrorCode, string> = {
  SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE:
    "Automatic Snapchat publishing is not enabled for this connection.",
  SNAPCHAT_PUBLIC_PROFILE_NOT_FOUND:
    "No Snapchat Public Profile is available for this account.",
  SNAPCHAT_PERMISSION_MISSING:
    "Snapchat publishing permission is missing. Reconnect Snapchat.",
  SNAPCHAT_TOKEN_EXPIRED: "Your Snapchat connection expired. Reconnect Snapchat.",
  SNAPCHAT_TOKEN_REFRESH_FAILED: "Your Snapchat connection expired. Reconnect Snapchat.",
  SNAPCHAT_VIDEO_NOT_FOUND: "The stored video for this post could not be found.",
  SNAPCHAT_VIDEO_UNSUPPORTED: "Snapchat does not support this video format.",
  SNAPCHAT_VIDEO_TOO_LARGE: "This video is larger than Snapchat allows.",
  SNAPCHAT_MEDIA_UPLOAD_FAILED: "Snapchat could not accept this video upload.",
  SNAPCHAT_MEDIA_PROCESSING_FAILED: "Snapchat could not process this video.",
  SNAPCHAT_MEDIA_PROCESSING_TIMEOUT:
    "Snapchat is still processing this video. PostFlow will try again.",
  SNAPCHAT_CONTENT_CREATE_FAILED: "Snapchat could not create this post.",
  SNAPCHAT_PUBLISH_FAILED: "Snapchat could not publish this post.",
  SNAPCHAT_RATE_LIMITED:
    "Snapchat is temporarily limiting publishing. PostFlow will retry automatically.",
  SNAPCHAT_RECONNECT_REQUIRED: "Reconnect Snapchat to continue publishing.",
};

export function snapchatErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (SNAPCHAT_ERROR_MESSAGES as Record<string, string>)[code] ?? null;
}

/** Codes the worker may retry automatically. */
export const SNAPCHAT_RETRYABLE_CODES: SnapchatErrorCode[] = [
  "SNAPCHAT_RATE_LIMITED",
  "SNAPCHAT_MEDIA_PROCESSING_TIMEOUT",
  "SNAPCHAT_MEDIA_UPLOAD_FAILED",
  "SNAPCHAT_PUBLISH_FAILED",
];
