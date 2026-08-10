// Central capability + validation engine. Every destination is judged on its own.
import type { SocialPlatform } from "@/lib/social-platforms";
import type { ValidationIssue, ValidationResult } from "@/lib/publishing-types";

export type PlatformCapability = {
  platform: string;
  publishing_enabled: boolean;
  oauth_enabled: boolean;
  maintenance_mode: boolean;
  supported_post_types: string[];
  supported_media_types: string[];
  limits: Record<string, any>;
  rate_limit_config: Record<string, any>;
  required_scopes: string[];
  max_retries: number;
  notice: string | null;
};

export type ValidationSubject = {
  destinationId: string;
  platform: SocialPlatform;
  accountId: string;
  accountLabel: string;
  accountScopes: string[];
  accountConnected: boolean;
  tokenExpiresAt: string | null;
  publishingEnabled: boolean;
  publishingEligible: boolean;
  title: string;
  caption: string;
  description: string;
  hashtags: string[];
  linkUrl: string | null;
  settings: Record<string, unknown>;
  media: {
    mediaType: "image" | "video" | "none";
    mimeType: string | null;
    fileSize: number;
    durationSeconds: number | null;
    aspectRatio: number | null;
  };
};

export async function loadCapabilities(): Promise<Record<string, PlatformCapability>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("platform_capabilities").select("*");
  if (error) throw error;
  const map: Record<string, PlatformCapability> = {};
  for (const row of data ?? []) map[row.platform] = row as unknown as PlatformCapability;
  return map;
}

function issue(
  code: string,
  message: string,
  options: { field?: string; canAutoFix?: boolean } = {},
): ValidationIssue {
  return {
    code,
    message,
    canAutoFix: options.canAutoFix ?? false,
    ...(options.field ? { field: options.field } : {}),
  };
}

/** Validates one destination against the stored platform capability record. */
export function validateDestination(
  subject: ValidationSubject,
  capability: PlatformCapability | undefined,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const limits = capability?.limits ?? {};

  if (!capability) {
    issues.push(issue("platform_unknown", "This platform is not configured for publishing."));
  } else {
    if (capability.maintenance_mode) {
      issues.push(issue("platform_maintenance", capability.notice ?? "This platform is temporarily paused."));
    }
    if (!capability.publishing_enabled) {
      issues.push(issue("platform_paused", capability.notice ?? "This platform is temporarily paused."));
    }
    const missingScopes = capability.required_scopes.filter((scope) => !subject.accountScopes.includes(scope));
    if (missingScopes.length > 0) {
      issues.push(
        issue(
          "scope_missing",
          `Reconnect ${subject.platform} and approve the publishing permissions required for this account.`,
        ),
      );
    }
  }

  if (!subject.accountConnected) {
    issues.push(issue("account_disconnected", "This account needs to be reconnected."));
  }
  if (subject.tokenExpiresAt && new Date(subject.tokenExpiresAt).getTime() <= Date.now()) {
    issues.push(issue("token_expired", "This account needs to be reconnected."));
  }
  if (!subject.publishingEnabled || !subject.publishingEligible) {
    issues.push(issue("publishing_disabled", "Publishing is turned off for this account."));
  }

  // Media rules
  const { media } = subject;
  if (media.mediaType === "none") {
    if (subject.platform !== "facebook") {
      issues.push(issue("media_required", "This destination requires an image or video.", { field: "media" }));
    }
  } else {
    const supportedTypes = capability?.supported_media_types ?? [];
    if (media.mimeType && supportedTypes.length > 0 && !supportedTypes.includes(media.mimeType)) {
      issues.push(
        issue("media_unsupported", "This media format is not supported for this destination.", {
          field: "media",
        }),
      );
    }
    const supportedPostTypes = capability?.supported_post_types ?? [];
    if (supportedPostTypes.length > 0 && !supportedPostTypes.includes(media.mediaType)) {
      issues.push(
        issue("post_type_unsupported", `${subject.platform} does not accept this content type.`, {
          field: "media",
        }),
      );
    }
    const maxMb = Number(limits["file_max_mb"] ?? 0);
    if (maxMb > 0 && media.fileSize > maxMb * 1024 * 1024) {
      issues.push(issue("file_too_large", `This file is larger than the ${maxMb} MB limit.`, { field: "media" }));
    }
    const maxSeconds = Number(limits["video_max_seconds"] ?? 0);
    if (media.mediaType === "video" && maxSeconds > 0 && (media.durationSeconds ?? 0) > maxSeconds) {
      issues.push(
        issue("video_too_long", `Videos must be ${maxSeconds} seconds or shorter here.`, { field: "media" }),
      );
    }
    const minAspect = Number(limits["min_aspect"] ?? 0);
    const maxAspect = Number(limits["max_aspect"] ?? 0);
    if (media.aspectRatio && minAspect && maxAspect) {
      if (media.aspectRatio < minAspect || media.aspectRatio > maxAspect) {
        issues.push(
          issue("aspect_ratio", "This aspect ratio is outside the supported range for this destination.", {
            field: "media",
            canAutoFix: true,
          }),
        );
      }
    }
  }

  // Text rules
  const captionMax = Number(limits["caption_max"] ?? 0);
  const captionLength = [subject.caption, subject.hashtags.join(" ")].filter(Boolean).join("\n\n").length;
  if (captionMax > 0 && captionLength > captionMax) {
    issues.push(
      issue("caption_too_long", `The caption is longer than ${captionMax} characters here.`, {
        field: "caption",
        canAutoFix: true,
      }),
    );
  }
  const titleMax = Number(limits["title_max"] ?? 0);
  if (titleMax > 0 && subject.title.length > titleMax) {
    issues.push(issue("title_too_long", `The title must be ${titleMax} characters or fewer.`, { field: "title" }));
  }
  if (limits["title_required"] && !subject.title.trim()) {
    issues.push(issue("title_required", `${subject.platform} requires a title.`, { field: "title" }));
  }
  const descriptionMax = Number(limits["description_max"] ?? 0);
  if (descriptionMax > 0 && subject.description.length > descriptionMax) {
    issues.push(
      issue("description_too_long", `The description must be ${descriptionMax} characters or fewer.`, {
        field: "description",
      }),
    );
  }
  const hashtagMax = Number(limits["hashtag_max"] ?? 0);
  if (hashtagMax > 0 && subject.hashtags.length > hashtagMax) {
    issues.push(
      issue("too_many_hashtags", `Use ${hashtagMax} hashtags or fewer here.`, {
        field: "hashtags",
        canAutoFix: true,
      }),
    );
  }
  if (limits["board_required"] && !subject.settings["boardId"]) {
    issues.push(issue("board_required", "Pinterest requires a board.", { field: "boardId" }));
  }
  if (limits["playlist_required"] && !subject.settings["playlistId"]) {
    issues.push(issue("playlist_required", "This destination requires a playlist.", { field: "playlistId" }));
  }
  const privacyOptions = (limits["privacy_options"] ?? []) as string[];
  const privacy = subject.settings["privacy"];
  if (privacyOptions.length > 0 && privacy && !privacyOptions.includes(String(privacy))) {
    issues.push(issue("privacy_invalid", "That privacy option is not available here.", { field: "privacy" }));
  }

  const blocking = issues.filter((i) => !i.canAutoFix);
  return {
    destinationId: subject.destinationId,
    platform: subject.platform,
    accountId: subject.accountId,
    accountLabel: subject.accountLabel,
    status: blocking.length > 0 ? "blocked" : issues.length > 0 ? "warning" : "ready",
    issues,
  };
}
