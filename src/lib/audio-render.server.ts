// Server-side audio/video mixing.
//
// Heavy media work never runs in the browser. The mix is described here and
// executed by a trusted FFmpeg worker (MEDIA_PROCESSOR_URL). The original
// upload is never modified: every mix is written as a new object under
// renders/ and recorded in media_renders.
import { MEDIA_BUCKET, signedMediaUrl, statMediaObject } from "@/lib/media-processing.server";
import {
  checkMusicRights,
  effectiveLevels,
  readPlatformAudio,
  applyMusicDestinationPolicy,
  type TrackState,
  type PlatformAudio,
} from "@/lib/music";
import type { SocialPlatform } from "@/lib/social-platforms";

export type RenderPlan = {
  /** ffmpeg -i arguments, in order. */
  inputs: string[];
  /** -filter_complex value. */
  filterComplex: string;
  /** Output map arguments. */
  maps: string[];
  outputArgs: string[];
};

const clamp01 = (percent: number) => Math.max(0, Math.min(2, percent / 100));

/** Creative voice shaping only — never a copyright-evasion transform. */
function voiceEffectFilters(effect: PlatformAudio["original"]["effect"]): string[] {
  const chain: string[] = [];
  if (effect.noiseReduction) chain.push("highpass=f=120", "afftdn=nf=-25");
  if (effect.speechEnhancement) chain.push("equalizer=f=3000:t=q:w=1:g=4", "acompressor=ratio=3");
  const mix = Math.max(0, Math.min(1, effect.intensity / 100));
  switch (effect.effect) {
    case "clean_speech":
      chain.push("highpass=f=100", "equalizer=f=2500:t=q:w=1.5:g=3");
      break;
    case "studio":
      chain.push("acompressor=ratio=3:threshold=-18dB", "equalizer=f=150:t=q:w=1:g=2");
      break;
    case "deep":
      chain.push(`asetrate=44100*${(1 - 0.12 * mix).toFixed(3)}`, "aresample=44100", "atempo=1.0");
      break;
    case "high_pitch":
      chain.push(`asetrate=44100*${(1 + 0.12 * mix).toFixed(3)}`, "aresample=44100");
      break;
    case "robot":
      chain.push("afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512");
      break;
    case "cartoon":
      chain.push(`asetrate=44100*${(1 + 0.25 * mix).toFixed(3)}`, "aresample=44100");
      break;
    case "radio":
      chain.push("highpass=f=300", "lowpass=f=3400", "acompressor=ratio=6");
      break;
    case "telephone":
      chain.push("highpass=f=400", "lowpass=f=3000");
      break;
    case "echo":
      chain.push(`aecho=0.8:0.9:${Math.round(200 + 600 * mix)}:${(0.3 * mix).toFixed(2)}`);
      break;
    case "reverb":
      chain.push(`aecho=0.8:0.88:60|100|140:${(0.3 * mix).toFixed(2)}|0.2|0.1`);
      break;
    default:
      break;
  }
  if (effect.pitch !== 0) {
    const ratio = Math.pow(2, effect.pitch / 12);
    chain.push(`asetrate=44100*${ratio.toFixed(4)}`, "aresample=44100");
  }
  if (effect.speed !== 1) chain.push(`atempo=${Math.min(2, Math.max(0.5, effect.speed)).toFixed(2)}`);
  return chain;
}

function laneChain(
  t: Pick<TrackState, "startSeconds" | "trimStartSeconds" | "trimEndSeconds" | "fadeInSeconds" | "fadeOutSeconds" | "loop">,
  volumePercent: number,
  videoDurationSeconds: number | null,
): string[] {
  const chain: string[] = [];
  if (t.trimStartSeconds > 0 || t.trimEndSeconds != null) {
    const end = t.trimEndSeconds != null ? `:end=${t.trimEndSeconds.toFixed(2)}` : "";
    chain.push(`atrim=start=${t.trimStartSeconds.toFixed(2)}${end}`, "asetpts=PTS-STARTPTS");
  }
  if (t.loop) chain.push("aloop=loop=-1:size=2e9");
  if (videoDurationSeconds) chain.push(`atrim=duration=${videoDurationSeconds.toFixed(2)}`);
  if (t.startSeconds > 0) chain.push(`adelay=${Math.round(t.startSeconds * 1000)}:all=1`);
  if (t.fadeInSeconds > 0) {
    chain.push(`afade=t=in:st=${t.startSeconds.toFixed(2)}:d=${t.fadeInSeconds.toFixed(2)}`);
  }
  if (t.fadeOutSeconds > 0 && videoDurationSeconds) {
    const st = Math.max(0, videoDurationSeconds - t.fadeOutSeconds);
    chain.push(`afade=t=out:st=${st.toFixed(2)}:d=${t.fadeOutSeconds.toFixed(2)}`);
  }
  chain.push(`volume=${clamp01(volumePercent).toFixed(2)}`);
  return chain;
}

/**
 * Builds the FFmpeg graph for one platform's audio card. Nothing here alters
 * pitch, speed, spectrum or metadata: those are copyright-evasion techniques
 * and PostFlow does not implement them.
 */
export function buildRenderPlan(
  audio: PlatformAudio,
  opts: {
    videoUrl: string;
    musicUrl: string | null;
    voiceUrl?: string | null;
    sfxUrl?: string | null;
    videoDurationSeconds: number | null;
  },
): RenderPlan {
  const inputs = [opts.videoUrl];
  const filters: string[] = [];
  const levels = effectiveLevels(audio);
  const duration = opts.videoDurationSeconds;

  if (audio.mode === "silent") {
    return { inputs, filterComplex: "", maps: ["-map", "0:v:0", "-an"], outputArgs: ["-c:v", "copy"] };
  }

  const labels: string[] = [];

  // 1. Original video audio — always available, never destroyed upstream.
  if (levels.original > 0) {
    const chain = [
      ...voiceEffectFilters(audio.original.effect),
      ...(audio.original.fadeInSeconds > 0
        ? [`afade=t=in:st=0:d=${audio.original.fadeInSeconds.toFixed(2)}`]
        : []),
      ...(audio.original.fadeOutSeconds > 0 && duration
        ? [`afade=t=out:st=${Math.max(0, duration - audio.original.fadeOutSeconds).toFixed(2)}:d=${audio.original.fadeOutSeconds.toFixed(2)}`]
        : []),
      `volume=${clamp01(levels.original).toFixed(2)}`,
    ];
    filters.push(`[0:a]${chain.join(",")}[orig]`);
    labels.push("orig");
  }

  // 2. Background music.
  let musicLabel: string | null = null;
  if (opts.musicUrl && levels.music > 0) {
    const index = inputs.length;
    inputs.push(opts.musicUrl);
    const chain = laneChain(
      {
        startSeconds: audio.musicStartSeconds,
        trimStartSeconds: audio.trimStartSeconds,
        trimEndSeconds: audio.trimEndSeconds,
        fadeInSeconds: audio.fadeInSeconds,
        fadeOutSeconds: audio.fadeOutSeconds,
        loop: audio.loop || audio.syncWithVideo,
      },
      levels.music,
      audio.syncWithVideo ? duration : null,
    );
    filters.push(`[${index}:a]${chain.join(",")}[music]`);
    musicLabel = "music";
  }

  // 3. Voice-over.
  let voiceLabel: string | null = null;
  if (opts.voiceUrl && levels.voice > 0) {
    const index = inputs.length;
    inputs.push(opts.voiceUrl);
    const chain = [
      ...voiceEffectFilters(audio.voice.effect),
      ...laneChain(audio.voice, levels.voice, duration),
    ];
    filters.push(`[${index}:a]${chain.join(",")}[voiceraw]`);
    filters.push(`[voiceraw]asplit=2[voice][voicekey]`);
    voiceLabel = "voice";
  }

  // 4. Sound effects.
  if (opts.sfxUrl && levels.sfx > 0) {
    const index = inputs.length;
    inputs.push(opts.sfxUrl);
    filters.push(`[${index}:a]${laneChain(audio.sfx, levels.sfx, duration).join(",")}[sfx]`);
    labels.push("sfx");
  }

  // Ducking: lower the music only while the voice-over speaks.
  if (musicLabel && voiceLabel && audio.ducking.enabled) {
    const ratio = Math.max(
      1,
      Math.min(20, levels.music > 0 ? levels.music / Math.max(1, audio.ducking.duckedMusicVolume) : 4),
    );
    filters.push(
      `[${musicLabel}][voicekey]sidechaincompress=threshold=0.05:ratio=${ratio.toFixed(1)}:attack=${audio.ducking.attackMs}:release=${audio.ducking.releaseMs}[ducked]`,
    );
    musicLabel = "ducked";
  } else if (voiceLabel) {
    filters.push(`[voicekey]anullsink`);
  }
  if (musicLabel) labels.push(musicLabel);
  if (voiceLabel) labels.push(voiceLabel);

  if (labels.length === 0) {
    return { inputs, filterComplex: "", maps: ["-map", "0:v:0", "-an"], outputArgs: ["-c:v", "copy"] };
  }

  const mixed =
    labels.length === 1
      ? `[${labels[0]}]anull`
      : `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0`;
  // Loudness normalisation + a limiter so a boosted lane cannot clip the export.
  filters.push(`${mixed},alimiter=limit=0.97,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);

  return {
    inputs,
    filterComplex: filters.join(";"),
    maps: ["-map", "0:v:0", "-map", "[aout]"],
    outputArgs: ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest"],
  };
}

export type ResolvedAudio =
  | { kind: "unchanged" }
  | { kind: "rendered"; storagePath: string; signedUrl: string };

export class AudioRightsError extends Error {}

/** A real media-worker problem — never a licence problem. */
export class MediaProcessorError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = "MediaProcessorError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Resolves the worker's mix endpoint from the configured base URL. */
function processorEndpoints(base: string): string[] {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return [base];
  }
  if (url.pathname && url.pathname !== "/") return [url.toString()];
  const root = url.origin;
  return [`${root}/v1/mix-audio`, `${root}/mix-audio`, `${root}/render`];
}

/** Per-request budget. The worker keeps running past this: we poll storage. */
const PROCESSOR_REQUEST_TIMEOUT_MS = 120_000;
/** Bounded retries for transient processor failures (502/503/504/524/timeout). */
const PROCESSOR_MAX_ATTEMPTS = 3;
const PROCESSOR_BACKOFF_MS = [5_000, 20_000, 45_000];
/** How long we keep waiting for the worker's output object after a timeout. */
const OUTPUT_POLL_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP statuses that mean "try again", including Cloudflare 52x proxy codes. */
export function isTransientProcessorStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Waits for the worker's output object to appear and validates it: the file
 * must exist and be non-empty before it is ever handed to a platform.
 * A 524 only means the HTTP proxy gave up — the FFmpeg job usually finishes,
 * so polling storage turns a "failure" into a normal success.
 */
async function waitForRenderedMedia(
  storagePath: string,
  budgetMs: number,
  heartbeat?: () => Promise<void>,
): Promise<{ signedUrl: string; size: number } | null> {
  const deadline = Date.now() + budgetMs;
  let tick = 0;
  while (Date.now() < deadline) {
    const stat = await statMediaObject(storagePath);
    if (stat && stat.size > 0) {
      const signed = await signedMediaUrl(storagePath, 3600);
      if (signed) return { signedUrl: signed, size: stat.size };
    }
    tick += 1;
    if (heartbeat && tick % 4 === 0) await heartbeat();
    await sleep(3_000);
  }
  return null;
}

/**
 * Validates the licence for this destination and, when the user asked for a
 * different soundtrack, produces a separate platform video file.
 */
export async function resolveDestinationAudio(input: {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
  accountLabel: string;
  destinationId: string;
  settings: Record<string, unknown>;
  descriptionText: string;
  media: { storagePath: string | null; mediaType: string; durationSeconds: number | null };
  /** Publish the untouched upload: no worker call, no music, no re-encode. */
  forceOriginalAudio?: boolean;
  /** Log correlation only — never used in the worker payload. */
  postId?: string | null;
  jobDestinationId?: string | null;
  attemptNumber?: number;
}): Promise<ResolvedAudio> {
  // Explicit "original audio only" retry: the pipeline must never touch the
  // media processor, so a worker outage can no longer block this destination.
  if (input.forceOriginalAudio) return { kind: "unchanged" };

  // Music destination policy: only YouTube (and Shorts) get the added music by
  // default, so every other platform reuses the original upload untouched.
  const audio = applyMusicDestinationPolicy(readPlatformAudio(input.settings), input.platform);
  const levels = effectiveLevels(audio);
  // "Extra audio" = the user actually attached a separate music / voice / SFX
  // source. Without one there is nothing to mix and the original upload is
  // published untouched — no worker call at all.
  const hasExtraAudio =
    (audio.mode === "music" && Boolean(audio.track) && levels.music > 0) ||
    (audio.voice.enabled && Boolean(audio.voice.track) && levels.voice > 0) ||
    (audio.sfx.enabled && Boolean(audio.sfx.track) && levels.sfx > 0);
  const needsRender =
    hasExtraAudio ||
    audio.mode === "silent" ||
    audio.original.muted ||
    audio.muteOriginal ||
    levels.original !== 100 ||
    audio.original.effect.effect !== "original" ||
    audio.original.effect.noiseReduction ||
    audio.original.effect.speechEnhancement;
  if (!needsRender) {
    console.info(
      "[MEDIA_MIX_SKIPPED]",
      JSON.stringify({
        post_id: input.postId ?? null,
        platform: input.platform,
        reason: "no_extra_audio",
      }),
    );
    return { kind: "unchanged" };
  }
  if (input.media.mediaType !== "video" || !input.media.storagePath) return { kind: "unchanged" };

  // Licence gate — an unknown or incompatible licence never reaches a provider.
  const rights = checkMusicRights({
    cardId: input.destinationId,
    platform: input.platform,
    accountLabel: input.accountLabel,
    audio,
    descriptionText: input.descriptionText,
  });
  if (rights.blocking) {
    throw new AudioRightsError(
      rights.notes[0] ?? "The selected music is not licensed for this platform.",
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Reuse an identical completed render instead of re-encoding.
  const { data: existing } = await supabaseAdmin
    .from("media_renders")
    .select("id, output_storage_path, status, mix")
    .eq("workspace_id", input.workspaceId)
    .eq("source_storage_path", input.media.storagePath)
    .eq("platform", input.platform)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10);
  // Only reuse a render produced by exactly this mix — otherwise a volume
  // change would silently publish the previous export.
  const identical = (existing ?? []).find(
    (row) => JSON.stringify(row.mix) === JSON.stringify(audio) && row.output_storage_path,
  );
  if (identical?.output_storage_path) {
    const url = await signedMediaUrl(identical.output_storage_path);
    if (url) return { kind: "rendered", storagePath: identical.output_storage_path, signedUrl: url };
  }

  const { data: render } = await supabaseAdmin
    .from("media_renders")
    .insert({
      workspace_id: input.workspaceId,
      created_by: input.userId,
      source_storage_path: input.media.storagePath,
      platform: input.platform,
      track_id: audio.trackId,
      mix: audio as never,
      status: "processing",
      attempt_count: input.attemptNumber ?? 1,
      processing_started_at: new Date().toISOString(),
      processing_heartbeat_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  /** Keeps the job visibly alive while FFmpeg runs, so it is not swept. */
  const heartbeat = async () => {
    if (!render?.id) return;
    await supabaseAdmin
      .from("media_renders")
      .update({ processing_heartbeat_at: new Date().toISOString() })
      .eq("id", render.id);
  };

  const markFailed = async (message: string, code?: string) => {
    if (render?.id) {
      await supabaseAdmin
        .from("media_renders")
        .update({
          status: "failed",
          error_message: message,
          error_code: code ?? null,
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", render.id);
    }
  };

  /** Licence / input problems the user can fix in the composer. */
  const fail = async (message: string): Promise<never> => {
    await markFailed(message);
    throw new AudioRightsError(message);
  };

  /** Real worker problems — never reported as a music-rights block. */
  const failProcessor = async (
    message: string,
    code: string,
    retryable = false,
  ): Promise<never> => {
    await markFailed(message, code);
    console.error(
      "[MEDIA_MIX_FAILED]",
      JSON.stringify({
        post_id: input.postId ?? null,
        processing_job_id: render?.id ?? null,
        job_destination_id: input.jobDestinationId ?? null,
        platform: input.platform,
        attempt: input.attemptNumber ?? 1,
        code,
        retryable,
      }),
    );
    throw new MediaProcessorError(message, code, retryable);
  };

  const processorUrl = process.env["MEDIA_PROCESSOR_URL"];
  const processorToken = process.env["MEDIA_PROCESSOR_TOKEN"];
  if (!processorUrl) {
    return failProcessor(
      "Background music needs the FFmpeg media processor. Add the MEDIA_PROCESSOR_URL secret, or publish this platform with the original audio.",
      "media_processor_not_configured",
    );
  }

  // 3. Verify the stored source video BEFORE anything is sent to the worker.
  const sourceStat = await statMediaObject(input.media.storagePath);
  if (!sourceStat || sourceStat.size <= 0) {
    return failProcessor(
      "The uploaded video is missing from storage. Re-upload the video on this post.",
      "MEDIA_SOURCE_VIDEO_MISSING",
    );
  }
  if (sourceStat.mimeType && !sourceStat.mimeType.startsWith("video/")) {
    return failProcessor(
      `The stored file is not a video (${sourceStat.mimeType}). Re-upload an MP4 or MOV.`,
      "MEDIA_SOURCE_VIDEO_INVALID",
    );
  }
  const videoUrl = await signedMediaUrl(input.media.storagePath, 6 * 3600);
  if (!videoUrl) {
    return failProcessor(
      "The uploaded video could no longer be read from storage. Re-upload the video on this post.",
      "stored_media_unavailable",
    );
  }

  let musicUrl: string | null = null;
  if (audio.mode === "music" && audio.track) {
    if (audio.track.audioPath) {
      const { data: signed } = await supabaseAdmin.storage
        .from("music")
        .createSignedUrl(audio.track.audioPath, 3600);
      musicUrl = signed?.signedUrl ?? null;
    } else {
      musicUrl = audio.track.audioUrl;
    }
    if (!musicUrl) return fail("The selected track's audio file could not be read.");
  }

  const laneUrl = async (track: PlatformAudio["voice"]["track"]) => {
    if (!track) return null;
    if (track.audioPath) {
      const { data: signed } = await supabaseAdmin.storage
        .from("music")
        .createSignedUrl(track.audioPath, 3600);
      return signed?.signedUrl ?? null;
    }
    return track.audioUrl;
  };
  const voiceUrl = audio.voice.enabled ? await laneUrl(audio.voice.track) : null;
  const sfxUrl = audio.sfx.enabled ? await laneUrl(audio.sfx.track) : null;
  if (audio.voice.enabled && audio.voice.track && !voiceUrl) {
    return fail("The voice-over audio file could not be read.");
  }

  // Deterministic output key: the same source + the same mix always maps to the
  // same object, so a retry after a proxy timeout reuses the finished render
  // instead of producing a duplicate file or a duplicate FFmpeg job.
  const mixKey = (() => {
    const raw = JSON.stringify({ src: input.media.storagePath, platform: input.platform, audio });
    let hash = 5381;
    for (let i = 0; i < raw.length; i += 1) hash = ((hash * 33) ^ raw.charCodeAt(i)) >>> 0;
    return hash.toString(36);
  })();
  const outputPath = `${input.userId}/renders/${input.platform}-${mixKey}.mp4`;

  // 11. Idempotent retry — a finished output from an earlier attempt is reused.
  {
    const existingOutput = await statMediaObject(outputPath);
    if (existingOutput && existingOutput.size > 0) {
      const signed = await signedMediaUrl(outputPath, 3600);
      if (signed) {
        if (render?.id) {
          await supabaseAdmin
            .from("media_renders")
            .update({
              status: "completed",
              output_storage_path: outputPath,
              output_size_bytes: existingOutput.size,
              processing_completed_at: new Date().toISOString(),
            })
            .eq("id", render.id);
        }
        console.info(
          "[MEDIA_MIX_REUSED]",
          JSON.stringify({
            post_id: input.postId ?? null,
            processing_job_id: render?.id ?? null,
            platform: input.platform,
            output_size: existingOutput.size,
          }),
        );
        return { kind: "rendered", storagePath: outputPath, signedUrl: signed };
      }
    }
  }

  const plan = buildRenderPlan(audio, {
    videoUrl,
    musicUrl,
    voiceUrl,
    sfxUrl,
    videoDurationSeconds: input.media.durationSeconds,
  });

  const authHeaders = processorToken ? { authorization: `Bearer ${processorToken}` } : {};

  // Health probe first: a worker that is down is a retryable outage, not a
  // licence problem and not a missing route.
  try {
    const origin = new URL(processorUrl).origin;
    const health = await fetch(`${origin}/health`, { headers: authHeaders });
    if (health.status >= 500) {
      return failProcessor(
        `The media processor is unavailable (HTTP ${health.status}).`,
        "media_processor_unavailable",
        true,
      );
    }
  } catch {
    // A missing /health route is not fatal — fall through to the mix call.
  }

  const body = JSON.stringify({
    platform: input.platform,
    bucket: MEDIA_BUCKET,
    outputPath,
    // The worker validates a top-level source video before it reads the plan.
    // Send both spellings so either worker contract is satisfied.
    video_url: videoUrl,
    videoUrl,
    music_url: musicUrl,
    voice_url: voiceUrl,
    sfx_url: sfxUrl,
    output_path: outputPath,
    duration_seconds: input.media.durationSeconds,
    plan,
    // The processor uploads the result back with the service role key it
    // holds; PostFlow never sends credentials in this payload.
  });

  // Pre-flight the payload so an invalid mix is reported as a fixable composer
  // problem instead of an opaque HTTP 400 coming back from the worker.
  if (plan.inputs.length === 0 || !plan.filterComplex.trim()) {
    return failProcessor(
      "The audio mix could not be built for this video.",
      "media_processor_invalid_plan",
    );
  }
  if (audio.mode === "music" && !musicUrl) {
    return failProcessor(
      "No music source was available for this mix.",
      "missing_music_source",
    );
  }

  const logBase = {
    post_id: input.postId ?? null,
    processing_job_id: render?.id ?? null,
    job_destination_id: input.jobDestinationId ?? null,
    platform: input.platform,
    input_video_key: input.media.storagePath,
    input_video_size: sourceStat.size,
    input_audio_key: audio.track?.audioPath ?? (musicUrl ? "external_url" : null),
    output_key: outputPath,
  };

  const startedAt = Date.now();
  let lastMessage = "The media processor did not finish the mix.";
  let lastCode = "media_processor_timeout";

  for (let attempt = 1; attempt <= PROCESSOR_MAX_ATTEMPTS; attempt += 1) {
    await heartbeat();
    let response: Response | null = null;
    let transport: "timeout" | "network" | null = null;
    for (const endpoint of processorEndpoints(processorUrl)) {
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body,
          signal: AbortSignal.timeout(PROCESSOR_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        transport = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
        response = null;
        break;
      }
      // Only a 404 means "wrong route" — try the next known route.
      if (response.status !== 404) break;
    }

    if (response && response.status === 404) {
      return failProcessor(
        "The media processor has no mix-audio route (HTTP 404). Publish this platform with the original audio.",
        "media_processor_route_not_found",
      );
    }

    if (response && response.ok) {
      // 202/200: the worker may still be writing the file — validate the output.
      const finished = await waitForRenderedMedia(outputPath, OUTPUT_POLL_MS, heartbeat);
      if (finished) {
        if (render?.id) {
          await supabaseAdmin
            .from("media_renders")
            .update({
              status: "completed",
              output_storage_path: outputPath,
              output_size_bytes: finished.size,
              attempt_count: attempt,
              processing_completed_at: new Date().toISOString(),
            })
            .eq("id", render.id);
        }
        console.info(
          "[MEDIA_MIX_COMPLETED]",
          JSON.stringify({
            ...logBase,
            attempt,
            output_size: finished.size,
            processing_ms: Date.now() - startedAt,
          }),
        );
        return { kind: "rendered", storagePath: outputPath, signedUrl: finished.signedUrl };
      }
      lastMessage = "The mixed video was not written back in time.";
      lastCode = "media_processor_output_missing";
    } else if (response) {
      // The worker returns { success:false, error_code, message, field }.
      const raw = await response.text().catch(() => "");
      let parsed: Record<string, unknown> = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }
      const workerCode =
        typeof parsed["error_code"] === "string"
          ? (parsed["error_code"] as string)
          : typeof parsed["code"] === "string"
            ? (parsed["code"] as string)
            : null;
      const workerMessage =
        typeof parsed["message"] === "string"
          ? (parsed["message"] as string)
          : typeof parsed["error"] === "string"
            ? (parsed["error"] as string)
            : raw
              ? raw.slice(0, 200)
              : null;
      const field = typeof parsed["field"] === "string" ? ` (${parsed["field"] as string})` : "";
      const transient = isTransientProcessorStatus(response.status);
      console.error(
        "[MEDIA_MIX_PROCESSOR_ERROR]",
        JSON.stringify({
          ...logBase,
          attempt,
          processor_status: response.status,
          processor_error_code: workerCode,
          processor_error_body: (workerMessage ?? "").slice(0, 300),
          processing_ms: Date.now() - startedAt,
          transient,
        }),
      );
      if (!transient) {
        return failProcessor(
          workerMessage
            ? `The media processor could not mix the audio: ${workerMessage}${field}`
            : `The media processor rejected the mix (HTTP ${response.status}).`,
          workerCode ? `media_processor_${workerCode}` : `media_processor_http_${response.status}`,
          false,
        );
      }
      // A 5xx/52x proxy cut-off does not stop FFmpeg — the worker usually keeps
      // going, so wait for the output before spending another attempt.
      const late = await waitForRenderedMedia(outputPath, OUTPUT_POLL_MS, heartbeat);
      if (late) {
        if (render?.id) {
          await supabaseAdmin
            .from("media_renders")
            .update({
              status: "completed",
              output_storage_path: outputPath,
              output_size_bytes: late.size,
              attempt_count: attempt,
              processing_completed_at: new Date().toISOString(),
            })
            .eq("id", render.id);
        }
        console.info(
          "[MEDIA_MIX_COMPLETED_AFTER_TIMEOUT]",
          JSON.stringify({ ...logBase, attempt, output_size: late.size }),
        );
        return { kind: "rendered", storagePath: outputPath, signedUrl: late.signedUrl };
      }
      lastMessage = `Media processing timed out (HTTP ${response.status}). It will be retried automatically.`;
      lastCode = `media_processor_http_${response.status}`;
    } else {
      console.error(
        "[MEDIA_MIX_TRANSPORT_ERROR]",
        JSON.stringify({ ...logBase, attempt, transport, processing_ms: Date.now() - startedAt }),
      );
      const late = await waitForRenderedMedia(outputPath, OUTPUT_POLL_MS, heartbeat);
      if (late) {
        if (render?.id) {
          await supabaseAdmin
            .from("media_renders")
            .update({
              status: "completed",
              output_storage_path: outputPath,
              output_size_bytes: late.size,
              attempt_count: attempt,
              processing_completed_at: new Date().toISOString(),
            })
            .eq("id", render.id);
        }
        return { kind: "rendered", storagePath: outputPath, signedUrl: late.signedUrl };
      }
      lastMessage =
        transport === "timeout"
          ? "Media processing is taking longer than expected. It will be retried automatically."
          : "The media processor could not be reached. It will be retried automatically.";
      lastCode = transport === "timeout" ? "media_processor_timeout" : "media_processor_unreachable";
    }

    if (render?.id) {
      await supabaseAdmin
        .from("media_renders")
        .update({ attempt_count: attempt, processing_heartbeat_at: new Date().toISOString() })
        .eq("id", render.id);
    }
    if (attempt < PROCESSOR_MAX_ATTEMPTS) {
      await sleep(PROCESSOR_BACKOFF_MS[attempt - 1] ?? 30_000);
    }
  }

  // 13/14. Every attempt timed out: this is temporary, so the destination is
  // retryable and the user can also publish the original video instead.
  return failProcessor(lastMessage, lastCode, true);
}