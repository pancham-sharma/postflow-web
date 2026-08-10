// Copyright-safe music model.
//
// PostFlow never removes copyright from a song and never claims a video is
// immune from a claim. It only lets a user attach audio they are legally
// allowed to use, records the licence evidence, and blocks a publish when the
// licence does not cover a selected platform.
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social-platforms";

export const MUSIC_SOURCES = [
  "postflow_library",
  "user_upload",
  "user_recording",
  "public_domain",
  "creative_commons",
  "licensed_third_party",
  "ai_generated",
] as const;
export type MusicSource = (typeof MUSIC_SOURCES)[number];

export const MUSIC_SOURCE_LABEL: Record<MusicSource, string> = {
  postflow_library: "PostFlow royalty-free library",
  user_upload: "Your uploaded music",
  user_recording: "Your recorded audio",
  public_domain: "Public domain",
  creative_commons: "Creative Commons",
  licensed_third_party: "Licensed third-party catalogue",
  ai_generated: "AI-generated instrumental",
};

export const LICENCE_TYPES = [
  "unknown",
  "public_domain",
  "cc0",
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "cc_by_nd",
  "royalty_free",
  "commercial_licence",
  "owned_by_user",
  "personal_use_only",
] as const;
export type LicenceType = (typeof LICENCE_TYPES)[number];

export const LICENCE_TYPE_LABEL: Record<LicenceType, string> = {
  unknown: "Licence unknown",
  public_domain: "Public domain",
  cc0: "CC0 (public-domain dedication)",
  cc_by: "CC BY (attribution)",
  cc_by_sa: "CC BY-SA (attribution, share-alike)",
  cc_by_nc: "CC BY-NC (non-commercial)",
  cc_by_nd: "CC BY-ND (no derivatives)",
  royalty_free: "Royalty-free licence",
  commercial_licence: "Commercial licence",
  owned_by_user: "Owned by you",
  personal_use_only: "Personal use only",
};

export type MusicTrack = {
  id: string;
  workspaceId: string | null;
  source: MusicSource;
  title: string;
  artist: string;
  audioUrl: string | null;
  audioPath: string | null;
  coverUrl: string | null;
  genre: string;
  mood: string;
  durationSeconds: number;
  licenceType: LicenceType;
  licenceName: string;
  commercialUse: boolean;
  monetizationAllowed: boolean;
  attributionRequired: boolean;
  attributionText: string;
  allowedPlatforms: SocialPlatform[];
  licenceUrl: string | null;
  licenceProofPath: string | null;
  licenceAcquiredAt: string | null;
  licenceExpiresAt: string | null;
  status: "active" | "draft" | "archived";
  ownershipConfirmedAt: string | null;
  originalFilename: string | null;
  fileHash: string | null;
};

export type AudioMode = "original" | "music" | "silent";

/* ------------------------------------------------------------------ */
/* Multi-track model                                                    */
/* ------------------------------------------------------------------ */

export const VOICE_EFFECTS = [
  "original",
  "clean_speech",
  "studio",
  "deep",
  "high_pitch",
  "robot",
  "cartoon",
  "radio",
  "telephone",
  "echo",
  "reverb",
] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

export const VOICE_EFFECT_LABEL: Record<VoiceEffect, string> = {
  original: "Original",
  clean_speech: "Clean speech",
  studio: "Studio voice",
  deep: "Deep voice",
  high_pitch: "High pitch",
  robot: "Robot",
  cartoon: "Cartoon",
  radio: "Radio",
  telephone: "Telephone",
  echo: "Echo",
  reverb: "Reverb",
};

export type VoiceEffectState = {
  effect: VoiceEffect;
  /** 0–100, how strongly the effect is applied. */
  intensity: number;
  /** Semitones, -12…12. Creative only — never a copyright workaround. */
  pitch: number;
  /** Playback rate, 0.5…2. */
  speed: number;
  noiseReduction: boolean;
  speechEnhancement: boolean;
};

export const defaultVoiceEffect: VoiceEffectState = {
  effect: "original",
  intensity: 60,
  pitch: 0,
  speed: 1,
  noiseReduction: false,
  speechEnhancement: false,
};

/** One independent, editable audio lane. */
export type TrackState = {
  enabled: boolean;
  volume: number;
  muted: boolean;
  solo: boolean;
  startSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number | null;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  loop: boolean;
  trackId: string | null;
  track: MusicTrack | null;
};

export const defaultTrackState: TrackState = {
  enabled: false,
  volume: 100,
  muted: false,
  solo: false,
  startSeconds: 0,
  trimStartSeconds: 0,
  trimEndSeconds: null,
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  loop: false,
  trackId: null,
  track: null,
};

export type OriginalTrackState = {
  volume: number;
  muted: boolean;
  solo: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  effect: VoiceEffectState;
};

export const defaultOriginalTrack: OriginalTrackState = {
  volume: 100,
  muted: false,
  solo: false,
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  effect: { ...defaultVoiceEffect },
};

export type DuckingState = {
  enabled: boolean;
  /** Music volume while the voice-over plays, in percent of the mix. */
  duckedMusicVolume: number;
  attackMs: number;
  releaseMs: number;
  sensitivity: number;
};

export const defaultDucking: DuckingState = {
  enabled: true,
  duckedMusicVolume: 10,
  attackMs: 200,
  releaseMs: 600,
  sensitivity: 50,
};

/** How a track reaches the platform. */
export type AudioAttachMode = "mixed" | "platform_attached";

/* ------------------------------------------------------------------ */
/* Music destination policy                                            */
/* ------------------------------------------------------------------ */

/**
 * Platforms that receive an added-music mix by default. Everything else keeps
 * the original uploaded file, so no third-party soundtrack is ever embedded in
 * an Instagram / Facebook / Snapchat / Pinterest export unless the user turns
 * it on for that platform explicitly.
 */
export const DEFAULT_MUSIC_DESTINATIONS: SocialPlatform[] = ["youtube"];

/** How the audio already inside the uploaded video is cleared by the user. */
export const SOURCE_AUDIO_OWNERSHIP = [
  "unknown",
  "owned",
  "permission",
  "platform_native",
] as const;
export type SourceAudioOwnership = (typeof SOURCE_AUDIO_OWNERSHIP)[number];

export const SOURCE_AUDIO_OWNERSHIP_LABEL: Record<SourceAudioOwnership, string> = {
  unknown: "Licence unknown",
  owned: "I own this audio",
  permission: "I have permission",
  platform_native: "Platform-native audio",
};

export const ORIGINAL_AUDIO_NOTICE =
  "Original video audio may still contain copyrighted music. PostFlow does not add the selected background track to this platform version.";

export type PlatformAudio = {
  mode: AudioMode;
  trackId: string | null;
  track: MusicTrack | null;
  musicVolume: number;
  originalVolume: number;
  muteOriginal: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number | null;
  loop: boolean;
  syncWithVideo: boolean;
  attributionText: string;
  /** false = this platform inherits the global mix. */
  customized: boolean;
  musicMuted: boolean;
  musicSolo: boolean;
  musicStartSeconds: number;
  attachMode: AudioAttachMode;
  /** Platforms the added music is mixed into. Default: YouTube (and Shorts). */
  musicDestinations: SocialPlatform[];
  /** "Use added music for YouTube only" — on by default. */
  youtubeOnlyMusic: boolean;
  /** What the user declared about the audio already inside the upload. */
  sourceAudioOwnership: SourceAudioOwnership;
  original: OriginalTrackState;
  voice: TrackState & { effect: VoiceEffectState };
  sfx: TrackState;
  ducking: DuckingState;
};

export const defaultPlatformAudio: PlatformAudio = {
  mode: "original",
  trackId: null,
  track: null,
  musicVolume: 25,
  originalVolume: 100,
  muteOriginal: false,
  fadeInSeconds: 1,
  fadeOutSeconds: 1,
  trimStartSeconds: 0,
  trimEndSeconds: null,
  loop: true,
  syncWithVideo: true,
  attributionText: "",
  customized: false,
  musicMuted: false,
  musicSolo: false,
  musicStartSeconds: 0,
  attachMode: "mixed",
  musicDestinations: [...DEFAULT_MUSIC_DESTINATIONS],
  youtubeOnlyMusic: true,
  sourceAudioOwnership: "unknown",
  original: { ...defaultOriginalTrack },
  voice: { ...defaultTrackState, volume: 100, effect: { ...defaultVoiceEffect } },
  sfx: { ...defaultTrackState, volume: 70 },
  ducking: { ...defaultDucking },
};

function compactTrack(track: MusicTrack | null): MusicTrack | null {
  if (!track) return null;
  return {
    ...track,
    // Signed storage URLs are preview-only and expire. Publish settings should
    // keep the storage key; the server mints a fresh signed URL when rendering.
    audioUrl: track.audioPath ? null : track.audioUrl,
    coverUrl: null,
  };
}

function compactLaneTrack<T extends TrackState>(lane: T): T {
  return { ...lane, track: compactTrack(lane.track) } as T;
}

export function compactPlatformAudio(audio: PlatformAudio): PlatformAudio {
  return {
    ...audio,
    track: compactTrack(audio.track),
    voice: compactLaneTrack(audio.voice),
    sfx: compactLaneTrack(audio.sfx),
  };
}

/* ------------------------------------------------------------------ */
/* Mix presets                                                          */
/* ------------------------------------------------------------------ */

export const MIX_PRESETS = [
  "original_only",
  "music_only",
  "voice_only",
  "original_low_music",
  "original_voice",
  "voice_low_music",
  "balanced",
] as const;
export type MixPreset = (typeof MIX_PRESETS)[number];

export const MIX_PRESET_LABEL: Record<MixPreset, string> = {
  original_only: "Original audio only",
  music_only: "Music only",
  voice_only: "Voice-over only",
  original_low_music: "Original + low music",
  original_voice: "Original + voice-over",
  voice_low_music: "Voice-over + low music",
  balanced: "Balanced mix",
};

/** Applies a preset without ever discarding the loaded tracks. */
export function applyMixPreset(audio: PlatformAudio, preset: MixPreset): PlatformAudio {
  const next: PlatformAudio = {
    ...audio,
    original: { ...audio.original },
    voice: { ...audio.voice },
    sfx: { ...audio.sfx },
  };
  const music = (volume: number, on: boolean) => {
    next.musicVolume = volume;
    next.musicMuted = !on;
    if (on && next.track) next.mode = "music";
  };
  switch (preset) {
    case "original_only":
      next.original = { ...next.original, volume: 100, muted: false };
      music(0, false);
      next.voice.muted = true;
      break;
    case "music_only":
      next.original = { ...next.original, muted: true };
      music(100, true);
      next.voice.muted = true;
      break;
    case "voice_only":
      next.original = { ...next.original, muted: true };
      music(0, false);
      next.voice = { ...next.voice, muted: false, volume: 100 };
      break;
    case "original_low_music":
      next.original = { ...next.original, volume: 100, muted: false };
      music(20, true);
      break;
    case "original_voice":
      next.original = { ...next.original, volume: 80, muted: false };
      music(0, false);
      next.voice = { ...next.voice, muted: false, volume: 100 };
      break;
    case "voice_low_music":
      next.original = { ...next.original, muted: true };
      music(15, true);
      next.voice = { ...next.voice, muted: false, volume: 100 };
      break;
    case "balanced":
      next.original = { ...next.original, volume: 70, muted: false };
      music(25, true);
      next.voice = { ...next.voice, muted: false, volume: 100 };
      break;
  }
  return next;
}

/** Full reset of the original lane. Other lanes are intentionally untouched. */
export function restoreOriginalAudio(audio: PlatformAudio): PlatformAudio {
  return {
    ...audio,
    originalVolume: 100,
    muteOriginal: false,
    original: { ...defaultOriginalTrack, effect: { ...defaultVoiceEffect } },
  };
}

export function isSelectablePlatform(v: unknown): v is SocialPlatform {
  return typeof v === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

function num(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function readTrackState(raw: unknown, base: TrackState): TrackState {
  if (!raw || typeof raw !== "object") return { ...base };
  const t = raw as Partial<TrackState>;
  return {
    ...base,
    ...t,
    volume: Math.min(200, Math.max(0, num(t.volume, base.volume))),
    startSeconds: Math.max(0, num(t.startSeconds, 0)),
    trimStartSeconds: Math.max(0, num(t.trimStartSeconds, 0)),
    trimEndSeconds: typeof t.trimEndSeconds === "number" ? t.trimEndSeconds : null,
    fadeInSeconds: Math.max(0, num(t.fadeInSeconds, base.fadeInSeconds)),
    fadeOutSeconds: Math.max(0, num(t.fadeOutSeconds, base.fadeOutSeconds)),
    track: t.track ?? null,
  };
}

function readEffect(raw: unknown): VoiceEffectState {
  if (!raw || typeof raw !== "object") return { ...defaultVoiceEffect };
  const e = raw as Partial<VoiceEffectState>;
  return {
    ...defaultVoiceEffect,
    ...e,
    effect: (VOICE_EFFECTS as readonly string[]).includes(e.effect ?? "")
      ? (e.effect as VoiceEffect)
      : "original",
    intensity: Math.min(100, Math.max(0, num(e.intensity, 60))),
    pitch: Math.min(12, Math.max(-12, num(e.pitch, 0))),
    speed: Math.min(2, Math.max(0.5, num(e.speed, 1))),
  };
}

/** Reads an audio mix out of a card's free-form settings bag. */
export function readPlatformAudio(settings: Record<string, unknown> | undefined): PlatformAudio {
  const raw = settings?.["audio"];
  if (!raw || typeof raw !== "object") return { ...defaultPlatformAudio };
  const a = raw as Partial<PlatformAudio>;
  return {
    ...defaultPlatformAudio,
    ...a,
    mode: a.mode === "music" || a.mode === "silent" ? a.mode : "original",
    musicVolume: Math.min(200, Math.max(0, num(a.musicVolume, 25))),
    originalVolume: Math.min(200, Math.max(0, num(a.originalVolume, 100))),
    fadeInSeconds: Math.max(0, num(a.fadeInSeconds, 1)),
    fadeOutSeconds: Math.max(0, num(a.fadeOutSeconds, 1)),
    trimStartSeconds: Math.max(0, num(a.trimStartSeconds, 0)),
    trimEndSeconds: typeof a.trimEndSeconds === "number" ? a.trimEndSeconds : null,
    track: a.track ?? null,
    musicStartSeconds: Math.max(0, num(a.musicStartSeconds, 0)),
    attachMode: a.attachMode === "platform_attached" ? "platform_attached" : "mixed",
    musicDestinations: Array.isArray(a.musicDestinations)
      ? a.musicDestinations.filter(isSelectablePlatform)
      : [...DEFAULT_MUSIC_DESTINATIONS],
    youtubeOnlyMusic: a.youtubeOnlyMusic !== false,
    sourceAudioOwnership: (SOURCE_AUDIO_OWNERSHIP as readonly string[]).includes(
      a.sourceAudioOwnership ?? "",
    )
      ? (a.sourceAudioOwnership as SourceAudioOwnership)
      : "unknown",
    original: {
      ...defaultOriginalTrack,
      ...(a.original ?? {}),
      volume: Math.min(200, Math.max(0, num(a.original?.volume, num(a.originalVolume, 100)))),
      muted: a.original?.muted ?? a.muteOriginal ?? false,
      effect: readEffect(a.original?.effect),
    },
    voice: {
      ...readTrackState(a.voice, { ...defaultTrackState, volume: 100 }),
      effect: readEffect((a.voice as { effect?: unknown } | undefined)?.effect),
    },
    sfx: readTrackState(a.sfx, { ...defaultTrackState, volume: 70 }),
    ducking: { ...defaultDucking, ...(a.ducking ?? {}) },
  };
}

/* ------------------------------------------------------------------ */
/* Effective (mute/solo aware) levels                                   */
/* ------------------------------------------------------------------ */

/**
 * Whether the added PostFlow music may be mixed into this platform's export.
 * A platform outside the music destinations only gets music when the user
 * customized that card and picked a track there deliberately.
 */
export function musicAllowedFor(audio: PlatformAudio, platform: SocialPlatform): boolean {
  if (audio.musicDestinations.includes(platform)) return true;
  return audio.customized && audio.mode === "music" && !!audio.track;
}

/**
 * Strips the added music from a mix when this platform is not a music
 * destination. The original audio, voice-over and effects stay untouched, so
 * the platform simply reuses the original upload.
 */
export function applyMusicDestinationPolicy(
  audio: PlatformAudio,
  platform: SocialPlatform,
): PlatformAudio {
  if (musicAllowedFor(audio, platform)) return audio;
  const stripped: PlatformAudio = {
    ...audio,
    mode: audio.mode === "music" ? "original" : audio.mode,
    track: null,
    trackId: null,
    musicVolume: 0,
    musicMuted: true,
    musicSolo: false,
    attributionText: "",
  };
  // A mix shaped for the YouTube export must not leak into a platform that is
  // only meant to reuse the original upload.
  if (audio.customized) return stripped;
  return {
    ...stripped,
    originalVolume: 100,
    muteOriginal: false,
    original: { ...defaultOriginalTrack, effect: { ...defaultVoiceEffect } },
  };
}

export type LaneKey = "original" | "music" | "voice" | "sfx";

/** Resolves mute + solo into the gain actually used for preview and render. */
export function effectiveLevels(audio: PlatformAudio): Record<LaneKey, number> {
  const musicActive = audio.mode === "music" && !!audio.track;
  const solo =
    audio.original.solo || audio.musicSolo || audio.voice.solo || audio.sfx.solo;
  const gate = (isSolo: boolean, muted: boolean, present: boolean) =>
    present && !muted && (!solo || isSolo);

  const silent = audio.mode === "silent";
  return {
    original: silent || !gate(audio.original.solo, audio.original.muted, true)
      ? 0
      : audio.original.volume,
    music: silent || !gate(audio.musicSolo, audio.musicMuted, musicActive) ? 0 : audio.musicVolume,
    voice: silent || !gate(audio.voice.solo, audio.voice.muted, audio.voice.enabled)
      ? 0
      : audio.voice.volume,
    sfx: silent || !gate(audio.sfx.solo, audio.sfx.muted, audio.sfx.enabled) ? 0 : audio.sfx.volume,
  };
}

export type AudioWarning = { level: "error" | "warning"; message: string };

/** Pre-render validation. Errors block a render; warnings never do. */
export function validateAudio(
  audio: PlatformAudio,
  videoDurationSeconds: number | null,
): AudioWarning[] {
  const out: AudioWarning[] = [];
  const levels = effectiveLevels(audio);
  const audible = Object.values(levels).some((v) => v > 0);

  if (!audible && audio.mode !== "silent") {
    out.push({ level: "error", message: "All audio tracks are muted — the export would be silent." });
  }
  for (const [name, t] of [
    ["Music", { start: audio.musicStartSeconds, trimStart: audio.trimStartSeconds, trimEnd: audio.trimEndSeconds }],
    ["Voice-over", { start: audio.voice.startSeconds, trimStart: audio.voice.trimStartSeconds, trimEnd: audio.voice.trimEndSeconds }],
    ["Sound effects", { start: audio.sfx.startSeconds, trimStart: audio.sfx.trimStartSeconds, trimEnd: audio.sfx.trimEndSeconds }],
  ] as const) {
    if (t.trimEnd != null && t.trimEnd <= t.trimStart) {
      out.push({ level: "error", message: `${name}: the trim end is before the trim start.` });
    }
    if (videoDurationSeconds && t.start >= videoDurationSeconds) {
      out.push({ level: "warning", message: `${name} starts after the video ends.` });
    }
  }
  for (const [name, v] of [
    ["Original audio", levels.original],
    ["Music", levels.music],
    ["Voice-over", levels.voice],
    ["Sound effects", levels.sfx],
  ] as const) {
    if (v > 100) out.push({ level: "warning", message: `${name} is above 100% and may distort or clip.` });
  }
  if (levels.original === 0 && audio.mode !== "silent") {
    out.push({ level: "warning", message: "Original video audio is disabled for this platform." });
  }
  if (levels.voice > 0 && levels.music > levels.voice) {
    out.push({ level: "warning", message: "Music may overpower the voice-over — enable ducking or lower the music." });
  }
  return out;
}

export type BadgeTone = "safe" | "warn" | "danger" | "info";
export type LicenceBadge = { label: string; tone: BadgeTone };

export function isExpired(track: MusicTrack): boolean {
  if (!track.licenceExpiresAt) return false;
  return new Date(track.licenceExpiresAt).getTime() < Date.now();
}

/** Selected platforms this track is NOT licensed for. */
export function missingPlatforms(
  track: MusicTrack,
  selectedPlatforms: SocialPlatform[],
): SocialPlatform[] {
  return selectedPlatforms.filter((p) => !track.allowedPlatforms.includes(p));
}

/** True when the track's licence covers every selected platform. */
export function isUniversallyLicensed(
  track: MusicTrack,
  selectedPlatforms: SocialPlatform[],
): boolean {
  return (
    track.licenceType !== "unknown" &&
    !isExpired(track) &&
    missingPlatforms(track, selectedPlatforms).length === 0
  );
}

export function licenceBadges(
  track: MusicTrack,
  selectedPlatforms: SocialPlatform[] = [],
): LicenceBadge[] {
  const badges: LicenceBadge[] = [];
  if (track.licenceType === "unknown") {
    return [{ label: "Licence unknown", tone: "danger" }];
  }
  if (isExpired(track)) badges.push({ label: "Licence expired", tone: "danger" });

  const missing = missingPlatforms(track, selectedPlatforms);
  if (selectedPlatforms.length > 0 && missing.length === 0) {
    badges.push({ label: "Safe for all selected platforms", tone: "safe" });
  }
  if (missing.length > 0) {
    badges.push({ label: `Platform restricted · ${missing.join(", ")}`, tone: "warn" });
  }
  const only = track.allowedPlatforms;
  if (only.length === 1 && only[0] === "youtube") {
    badges.push({ label: "YouTube only", tone: "info" });
  }
  if (only.length === 2 && only.includes("facebook") && only.includes("instagram")) {
    badges.push({ label: "Meta only", tone: "info" });
  }
  badges.push(
    track.commercialUse
      ? { label: "Commercial use allowed", tone: "safe" }
      : { label: "Personal use only", tone: "warn" },
  );
  badges.push(
    track.monetizationAllowed
      ? { label: "Monetization allowed", tone: "safe" }
      : { label: "Monetization not covered", tone: "warn" },
  );
  if (track.attributionRequired) badges.push({ label: "Attribution required", tone: "warn" });
  return badges;
}

export function buildAttribution(track: MusicTrack): string {
  if (track.attributionText.trim()) return track.attributionText.trim();
  return [
    `Music: ${track.title}${track.artist ? ` by ${track.artist}` : ""}`,
    `Licence: ${track.licenceName || LICENCE_TYPE_LABEL[track.licenceType]}`,
    `Source: ${track.licenceUrl ?? MUSIC_SOURCE_LABEL[track.source]}`,
  ].join("\n");
}

/**
 * Appends the required credit to a description. Attribution can never be
 * silently dropped — this runs automatically right before publishing.
 */
export function withAttribution(text: string, attribution: string): string {
  const credit = attribution.trim();
  if (!credit) return text;
  if (text.includes(credit)) return text;
  return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${credit}`;
}

export type RiskLevel =
  | "low_risk"
  | "attribution_required"
  | "platform_restricted"
  | "licence_incomplete"
  | "do_not_publish";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low_risk: "Low risk",
  attribution_required: "Attribution required",
  platform_restricted: "Platform restricted",
  licence_incomplete: "Licence incomplete",
  do_not_publish: "Do not publish",
};

export const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  low_risk: "safe",
  attribution_required: "warn",
  platform_restricted: "warn",
  licence_incomplete: "warn",
  do_not_publish: "danger",
};

export type RightsCheck = {
  platform: SocialPlatform;
  cardId: string;
  accountLabel: string;
  usingMusic: boolean;
  trackTitle: string | null;
  licenceVerified: boolean;
  platformsConfirmed: boolean;
  commercialUseConfirmed: boolean;
  monetizationConfirmed: boolean;
  attributionIncluded: boolean;
  licenceDocumentAvailable: boolean;
  risk: RiskLevel;
  blocking: boolean;
  notes: string[];
};

export function checkMusicRights(input: {
  cardId: string;
  platform: SocialPlatform;
  accountLabel: string;
  audio: PlatformAudio;
  descriptionText: string;
}): RightsCheck {
  const { audio, platform } = input;
  const base = {
    platform,
    cardId: input.cardId,
    accountLabel: input.accountLabel,
    usingMusic: audio.mode === "music",
    trackTitle: audio.track?.title ?? null,
  };

  if (audio.mode !== "music" || !audio.track) {
    return {
      ...base,
      licenceVerified: true,
      platformsConfirmed: true,
      commercialUseConfirmed: true,
      monetizationConfirmed: true,
      attributionIncluded: true,
      licenceDocumentAvailable: true,
      risk: "low_risk",
      blocking: false,
      notes: [
        audio.mode === "silent"
          ? "Publishing a silent version — no added music."
          : "Keeping the original video audio. You remain responsible for any music already inside the video.",
      ],
    };
  }

  const track = audio.track;
  const notes: string[] = [];
  const unknown = track.licenceType === "unknown";
  const expired = isExpired(track);
  const missing = missingPlatforms(track, [platform]);
  const attribution = track.attributionRequired ? buildAttribution(track) : "";
  const firstLine = attribution.split("\n")[0] ?? "";
  const attributionIncluded = !track.attributionRequired || input.descriptionText.includes(firstLine);

  if (unknown) notes.push("The licence for this track is unknown — it cannot be published.");
  if (expired) notes.push("The licence for this track has expired.");
  if (missing.length > 0) {
    notes.push(
      `This track is not licensed for ${platform}. Pick another track, remove the music, keep the original audio, or exclude this platform.`,
    );
  }
  if (!track.commercialUse) notes.push("Personal use only — not cleared for branded or commercial posts.");
  if (!track.monetizationAllowed) notes.push("Monetization is not covered by this licence.");
  if (track.attributionRequired) {
    notes.push("The required credit is added to this platform's description automatically.");
  }

  const blocking = unknown || expired || missing.length > 0;
  const risk: RiskLevel = blocking
    ? "do_not_publish"
    : !track.licenceUrl && !track.licenceProofPath
      ? "licence_incomplete"
      : track.attributionRequired
        ? "attribution_required"
        : !track.commercialUse
          ? "platform_restricted"
          : "low_risk";

  return {
    ...base,
    licenceVerified: !unknown && !expired,
    platformsConfirmed: missing.length === 0,
    commercialUseConfirmed: track.commercialUse,
    monetizationConfirmed: track.monetizationAllowed,
    attributionIncluded,
    licenceDocumentAvailable: Boolean(track.licenceUrl || track.licenceProofPath),
    risk,
    blocking,
    notes,
  };
}

export const COPYRIGHT_DISCLAIMER =
  "This check cannot guarantee that a platform will not issue a claim, mute the audio, restrict monetization, or remove the content.";

export const COPYRIGHT_NOTICES = [
  "Changing music volume, pitch, speed, or voice does not remove copyright.",
  "Platform music availability and rights may vary by account, region, post type, and platform.",
  COPYRIGHT_DISCLAIMER,
];

/**
 * Whether a platform exposes an official audio-attach API to PostFlow today.
 * When false, music can only be mixed into a new export — PostFlow never
 * downloads or redistributes a platform's catalogue.
 */
export const PLATFORM_ATTACHED_AUDIO: Record<string, boolean> = {
  instagram: false,
  facebook: false,
  youtube: false,
  pinterest: false,
  snapchat: false,
  linkedin: false,
};

export const PLATFORM_AUDIO_SOURCES: Record<string, string[]> = {
  instagram: ["User-owned music", "PostFlow licensed music", "Original video audio", "Voice-over"],
  facebook: ["User-owned music", "PostFlow licensed music", "Original video audio", "Voice-over"],
  youtube: ["YouTube-safe licensed music", "User-owned music", "Original video audio", "Voice-over"],
  pinterest: ["User-owned music", "PostFlow licensed music", "Original video audio"],
  snapchat: ["User-owned music", "PostFlow licensed music", "Original video audio"],
  linkedin: ["User-owned or licensed music", "Original video audio", "Voice-over"],
};

export const UPLOAD_CONFIRMATION =
  "I confirm that I own this audio or have permission to use it on every selected platform.";

export const UPLOAD_WARNING =
  "Uploading a song does not prove ownership. You remain responsible for having the required rights.";

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
