// Single source of truth for Snapchat media requirements.
//
// Sources: Snapchat Public Profile / Business API media guidelines for Public
// Story and Spotlight video content (MP4/MOV, H.264 + AAC, vertical 9:16).
// Limits live here only — never duplicated in components or adapters — so a
// documentation change is a one-line edit.
export const SNAPCHAT_DESTINATIONS = ["public_story", "spotlight"] as const;
export type SnapchatDestination = (typeof SNAPCHAT_DESTINATIONS)[number];

export const SNAPCHAT_DESTINATION_LABEL: Record<SnapchatDestination, string> = {
  public_story: "Public Story",
  spotlight: "Spotlight",
};

export type SnapchatMediaFacts = {
  exists: boolean;
  mimeType: string | null;
  fileSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

export type SnapchatMediaRules = {
  mimeTypes: string[];
  maxFileSizeBytes: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  /** Target aspect ratio (width / height) with the accepted tolerance. */
  aspectRatio: number;
  aspectRatioTolerance: number;
  minWidth: number;
  minHeight: number;
};

export const SNAPCHAT_MEDIA_RULES: Record<SnapchatDestination, SnapchatMediaRules> = {
  // Public Story: vertical video, up to 60s per Snapchat's Public Profile docs.
  public_story: {
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxFileSizeBytes: 300 * 1024 * 1024,
    minDurationSeconds: 3,
    maxDurationSeconds: 60,
    aspectRatio: 9 / 16,
    aspectRatioTolerance: 0.06,
    minWidth: 540,
    minHeight: 960,
  },
  // Spotlight: vertical video, 5s-180s per Snapchat's Spotlight guidelines.
  spotlight: {
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxFileSizeBytes: 500 * 1024 * 1024,
    minDurationSeconds: 5,
    maxDurationSeconds: 180,
    aspectRatio: 9 / 16,
    aspectRatioTolerance: 0.06,
    minWidth: 540,
    minHeight: 960,
  },
};

export type SnapchatMediaIssue = { code: string; message: string };

export function validateSnapchatMedia(
  destination: SnapchatDestination,
  media: SnapchatMediaFacts,
): { ok: boolean; issues: SnapchatMediaIssue[] } {
  const rules = SNAPCHAT_MEDIA_RULES[destination];
  const issues: SnapchatMediaIssue[] = [];

  if (!media.exists) {
    return {
      ok: false,
      issues: [{ code: "SNAPCHAT_VIDEO_NOT_FOUND", message: "No stored video was found for this post." }],
    };
  }
  const mime = (media.mimeType ?? "").toLowerCase();
  if (!mime || !rules.mimeTypes.includes(mime)) {
    issues.push({
      code: "SNAPCHAT_VIDEO_UNSUPPORTED",
      message: `Snapchat ${SNAPCHAT_DESTINATION_LABEL[destination]} accepts MP4 or MOV video (H.264 + AAC).`,
    });
  }
  if (media.fileSize > rules.maxFileSizeBytes) {
    issues.push({
      code: "SNAPCHAT_VIDEO_TOO_LARGE",
      message: `This video is larger than the ${Math.round(rules.maxFileSizeBytes / (1024 * 1024))} MB Snapchat limit.`,
    });
  }
  if (media.durationSeconds !== null) {
    if (media.durationSeconds < rules.minDurationSeconds) {
      issues.push({
        code: "SNAPCHAT_VIDEO_UNSUPPORTED",
        message: `Snapchat needs at least ${rules.minDurationSeconds} seconds of video.`,
      });
    }
    if (media.durationSeconds > rules.maxDurationSeconds) {
      issues.push({
        code: "SNAPCHAT_VIDEO_UNSUPPORTED",
        message: `${SNAPCHAT_DESTINATION_LABEL[destination]} videos can be at most ${rules.maxDurationSeconds} seconds.`,
      });
    }
  }
  if (media.width && media.height) {
    if (media.width < rules.minWidth || media.height < rules.minHeight) {
      issues.push({
        code: "SNAPCHAT_VIDEO_UNSUPPORTED",
        message: `Snapchat needs at least ${rules.minWidth}x${rules.minHeight} resolution.`,
      });
    }
    const ratio = media.width / media.height;
    if (Math.abs(ratio - rules.aspectRatio) > rules.aspectRatioTolerance) {
      issues.push({
        code: "SNAPCHAT_VIDEO_UNSUPPORTED",
        message: "Snapchat needs a vertical 9:16 video.",
      });
    }
  }
  return { ok: issues.length === 0, issues };
}
