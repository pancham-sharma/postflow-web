// Client-safe YouTube publishing options. The composer writes these into a
// destination's platform_settings; the YouTube adapter reads them back so the
// metadata YouTube receives is always an explicit user choice.

export const YOUTUBE_PRIVACY = ["public", "unlisted", "private"] as const;
export type YouTubePrivacy = (typeof YOUTUBE_PRIVACY)[number];

/** auto = decide from orientation/duration, short = force #Shorts, long = never tag. */
export const YOUTUBE_SHORTS_MODES = ["auto", "short", "long"] as const;
export type YouTubeShortsMode = (typeof YOUTUBE_SHORTS_MODES)[number];

export type YouTubeOptions = {
  privacy: YouTubePrivacy;
  shortsMode: YouTubeShortsMode;
  madeForKids: boolean;
};

export const DEFAULT_YOUTUBE_OPTIONS: YouTubeOptions = {
  privacy: "public",
  shortsMode: "auto",
  madeForKids: false,
};

export const YOUTUBE_PRIVACY_LABEL: Record<YouTubePrivacy, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

export const YOUTUBE_SHORTS_MODE_LABEL: Record<YouTubeShortsMode, string> = {
  auto: "Auto (detect from video)",
  short: "Always publish as Short",
  long: "Always publish as regular video",
};

/** Normalizes whatever is stored in platform_settings into a complete option set. */
export function readYouTubeOptions(settings: Record<string, unknown>): YouTubeOptions {
  const privacy = settings["privacy"];
  const shortsMode = settings["shortsMode"];
  return {
    privacy: YOUTUBE_PRIVACY.includes(privacy as YouTubePrivacy)
      ? (privacy as YouTubePrivacy)
      : DEFAULT_YOUTUBE_OPTIONS.privacy,
    shortsMode: YOUTUBE_SHORTS_MODES.includes(shortsMode as YouTubeShortsMode)
      ? (shortsMode as YouTubeShortsMode)
      : DEFAULT_YOUTUBE_OPTIONS.shortsMode,
    madeForKids: settings["madeForKids"] === true,
  };
}

/**
 * A YouTube Short is a vertical (or square) clip of three minutes or less.
 * `auto` infers it; the explicit modes always win.
 */
export function resolveIsShort(
  mode: YouTubeShortsMode,
  media: { width: number | null; height: number | null; durationSeconds: number | null },
): boolean {
  if (mode === "short") return true;
  if (mode === "long") return false;
  const vertical =
    media.width !== null && media.height !== null && media.width > 0
      ? media.height >= media.width
      : true;
  const duration = media.durationSeconds ?? 0;
  return vertical && (duration === 0 || duration <= 180);
}
