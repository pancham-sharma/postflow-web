// Shared contract every provider adapter implements. Server-only types.
import type { SocialPlatform } from "@/lib/social-platforms";

export type SocialAccountRecord = {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  accountName: string;
  username: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

export type ProviderMedia = {
  mediaType: "image" | "video" | "none";
  mimeType: string | null;
  /** Time-limited URL the provider fetches the asset from. */
  signedUrl: string | null;
  /** Optional pre-generated poster image for providers such as Pinterest. */
  thumbnailUrl?: string | null;
  fileSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

/**
 * Durable resumable-upload state for a single publishing target. Persisted by
 * the engine so a worker restart resumes the same upload session instead of
 * re-uploading the video (and never creates a duplicate once the platform has
 * returned a video id).
 */
export type ResumableUploadState = {
  sessionUrl: string | null;
  bytesUploaded: number;
  videoId: string | null;
  /** Persists session/progress/video id. Also refreshes the progress heartbeat. */
  save(patch: {
    sessionUrl?: string | null;
    bytesUploaded?: number;
    videoId?: string | null;
    startedAt?: string;
    completedAt?: string;
  }): Promise<void>;
};

export type ProviderPublishInput = {
  account: SocialAccountRecord;
  title: string;
  caption: string;
  description: string;
  hashtags: string[];
  linkUrl: string | null;
  media: ProviderMedia;
  settings: Record<string, unknown>;
  idempotencyKey: string;
  /** publishing_job_destinations.id — used for per-job idempotency records. */
  jobDestinationId?: string;
  /** PostFlow user that owns the post (ownership checks, per-user tokens). */
  ownerId?: string;
  /** 1-based attempt number for this destination. */
  attemptNumber?: number;
  /** Resumable upload bookkeeping (YouTube). */
  uploadState?: ResumableUploadState;
};

export type ProviderPublishResult = {
  status: "published" | "processing" | "failed" | "requires_user_action";
  providerPostId?: string | undefined;
  providerPostUrl?: string | undefined;
  providerJobId?: string | undefined;
  rawResponseSafe?: Record<string, unknown> | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  retryable: boolean;
  /** User-facing copy for the `requires_user_action` state (never a failure). */
  userAction?:
    | {
        code: string;
        message: string;
      }
    | undefined;
};

export type ProviderPublishStatus = {
  status: "published" | "processing" | "failed";
  providerPostId?: string | undefined;
  providerPostUrl?: string | undefined;
  errorMessage?: string | undefined;
};

export type PublishingProviderAdapter = {
  platform: SocialPlatform;
  publish(input: ProviderPublishInput): Promise<ProviderPublishResult>;
  getStatus?(account: SocialAccountRecord, providerJobId: string): Promise<ProviderPublishStatus>;
  revoke?(account: SocialAccountRecord): Promise<void>;
};

/** HTTP statuses and provider codes that are worth trying again later. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

const SECRET_KEY_PATTERN = /token|secret|authorization|key|credential|password|cookie/i;

/** Strips anything credential-shaped before a provider response is persisted. */
export function sanitizeResponse(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4 || value === null || typeof value !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      out[key] = sanitizeResponse(raw, depth + 1);
    } else if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 10).map((item) =>
        item && typeof item === "object" ? sanitizeResponse(item, depth + 1) : item,
      );
    } else {
      out[key] = raw;
    }
  }
  return out;
}

export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  safeResponse: Record<string, unknown>;

  constructor(
    message: string,
    options: { code?: string; retryable?: boolean; safeResponse?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code ?? "provider_error";
    this.retryable = options.retryable ?? false;
    this.safeResponse = options.safeResponse ?? {};
  }
}

/** fetch + JSON with provider-error normalization and safe logging. */
export async function providerFetch(
  label: string,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ProviderError(`${label} request could not be completed.`, {
      code: "network_error",
      retryable: true,
    });
  }
  const text = await response.text();
  let body: Record<string, any> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, any>;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const safe = sanitizeResponse(body);
    console.error(`[publish] ${label} failed [${response.status}]`, safe);
    const providerMessage =
      body['error']?.message ?? body['error_description'] ?? body['message'] ?? body['error'] ?? null;
    throw new ProviderError(
      typeof providerMessage === "string" ? providerMessage : `${label} failed.`,
      {
        code: String(body['error']?.code ?? body['error']?.type ?? `http_${response.status}`),
        retryable: isRetryableStatus(response.status),
        safeResponse: { ...safe, http_status: response.status },
      },
    );
  }
  return body;
}
