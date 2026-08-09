// Client-safe types shared by the composer, progress UI and the server engine.
import type { SocialPlatform } from "./social-platforms";

export const POST_STATUSES = [
  "draft",
  "validating",
  "queued",
  "publishing",
  "published",
  "partially_published",
  "failed",
  "cancelled",
  "requires_attention",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const DESTINATION_STATUSES = [
  "pending",
  "validating",
  "queued",
  "uploading",
  "processing",
  "published",
  "failed",
  "retry_scheduled",
  "cancelled",
  "reconnect_required",
  "rate_limited",
  "action_required",
] as const;
export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  validating: "Validating",
  queued: "Queued",
  publishing: "Publishing",
  published: "Published",
  partially_published: "Partially published",
  failed: "Failed",
  cancelled: "Cancelled",
  requires_attention: "Requires attention",
};

export const DESTINATION_STATUS_LABEL: Record<DestinationStatus, string> = {
  pending: "Pending",
  validating: "Validating",
  queued: "Queued",
  uploading: "Uploading",
  processing: "Processing",
  published: "Published",
  failed: "Failed",
  retry_scheduled: "Retry scheduled",
  cancelled: "Cancelled",
  reconnect_required: "Reconnect required",
  rate_limited: "Waiting on rate limit",
  action_required: "Ready to share",
};

export type ValidationIssue = {
  code: string;
  field?: string;
  message: string;
  canAutoFix: boolean;
};

export type ValidationResult = {
  destinationId: string;
  platform: SocialPlatform;
  accountId: string;
  accountLabel: string;
  status: "ready" | "warning" | "blocked";
  issues: ValidationIssue[];
};

export type DestinationProgress = {
  id: string;
  destinationId: string;
  platform: SocialPlatform;
  accountLabel: string;
  status: DestinationStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  providerPostId: string | null;
  providerPostUrl: string | null;
  errorMessage: string | null;
};

export type PublishingProgress = {
  jobId: string;
  postId: string;
  status: PostStatus;
  scheduledFor: string | null;
  destinations: DestinationProgress[];
  counts: { total: number; published: number; failed: number; processing: number };
};

/**
 * Retry ladder in minutes. Three attempts maximum: 1 minute, 5 minutes,
 * 15 minutes. Only temporary provider failures ever reach this ladder.
 */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15] as const;

/** Hard cap on automatic attempts per destination. */
export const MAX_PUBLISH_ATTEMPTS = 3;

export function nextRetryDelayMinutes(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber, 1), RETRY_BACKOFF_MINUTES.length) - 1;
  return RETRY_BACKOFF_MINUTES[index] ?? 15;
}

/** Backoff with +/-20% jitter so simultaneous failures do not stampede. */
export function nextRetryDelayMs(attemptNumber: number): number {
  const base = nextRetryDelayMinutes(attemptNumber) * 60_000;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(15_000, Math.round(base + jitter));
}

export function nextRetryAtIso(attemptNumber: number): string {
  return new Date(Date.now() + nextRetryDelayMs(attemptNumber)).toISOString();
}
