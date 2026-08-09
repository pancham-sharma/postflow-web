import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Ban,
  Headphones,
  Info,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Sparkles,
  TriangleAlert,
  Volume1,
  Volume2,
  VolumeX,
  Wand2,
  Mic,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import { Badge, TrackPicker } from "@/components/composer/audio-card";
import {
  COPYRIGHT_NOTICES,
  MIX_PRESETS,
  MIX_PRESET_LABEL,
  ORIGINAL_AUDIO_NOTICE,
  PLATFORM_ATTACHED_AUDIO,
  PLATFORM_AUDIO_SOURCES,
  SOURCE_AUDIO_OWNERSHIP,
  SOURCE_AUDIO_OWNERSHIP_LABEL,
  VOICE_EFFECTS,
  VOICE_EFFECT_LABEL,
  applyMixPreset,
  buildAttribution,
  defaultPlatformAudio,
  defaultTrackState,
  defaultVoiceEffect,
  effectiveLevels,
  formatDuration,
  licenceBadges,
  missingPlatforms,
  musicAllowedFor,
  restoreOriginalAudio,
  validateAudio,
  type MixPreset,
  type MusicTrack,
  type PlatformAudio,
  type SourceAudioOwnership,
  type TrackState,
  type VoiceEffect,
  type VoiceEffectState,
} from "@/lib/music";

/* ------------------------------------------------------------------ */
/* Accessible volume slider                                            */
/* ------------------------------------------------------------------ */

function VolumeSlider({
  label,
  value,
  onChange,
  muted,
  onToggleMute,
  onReset,
  disabled,
  tooltip,
  max = 200,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  muted?: boolean;
  onToggleMute?: () => void;
  onReset?: () => void;
  disabled?: boolean;
  tooltip?: string;
  max?: number;
}) {
  const Icon = muted || value === 0 ? VolumeX : value <= 50 ? Volume1 : Volume2;
  const id = `vol-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={cn("space-y-1.5", disabled && "opacity-50")}>
      <div className="flex items-center gap-2">
        {onToggleMute ? (
          <button
            type="button"
            aria-pressed={!!muted}
            aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
            title={muted ? `Unmute ${label}` : `Mute ${label}`}
            disabled={disabled}
            onClick={onToggleMute}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full border transition",
              muted ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-background hover:bg-muted/50",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          </span>
        )}
        <label htmlFor={id} className="flex-1 truncate text-xs font-semibold" title={tooltip}>
          {label}
        </label>
        <input
          type="number"
          aria-label={`${label} percentage`}
          min={0}
          max={max}
          step={1}
          disabled={disabled}
          value={Math.round(value)}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (Number.isFinite(raw)) onChange(Math.min(max, Math.max(0, raw)));
          }}
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums"
        />
        <span className="text-xs text-muted-foreground">%</span>
        {onReset && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            title={`Reset ${label}`}
            disabled={disabled}
            onClick={onReset}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background hover:bg-muted/50 transition"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuetext={`${Math.round(value)} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="audio-volume-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-muted disabled:cursor-not-allowed"
      />
      {value > 100 && (
        <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Audio above 100% may distort or clip.
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.5,
  min = 0,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-normal text-foreground"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="inline-flex items-start gap-2 text-xs" title={hint}>
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Voice effects                                                       */
/* ------------------------------------------------------------------ */

function VoiceEffectEditor({
  value,
  onChange,
  title,
}: {
  value: VoiceEffectState;
  onChange: (v: VoiceEffectState) => void;
  title: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Wand2 className="size-3.5" aria-hidden /> {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {VOICE_EFFECTS.map((effect) => (
          <button
            key={effect}
            type="button"
            aria-pressed={value.effect === effect}
            onClick={() => onChange({ ...value, effect: effect as VoiceEffect })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              value.effect === effect ? "border-primary bg-primary/10 text-primary" : "border-border",
            )}
          >
            {VOICE_EFFECT_LABEL[effect]}
          </button>
        ))}
      </div>
      {value.effect !== "original" && (
        <VolumeSlider
          label="Effect intensity"
          max={100}
          value={value.intensity}
          onChange={(v) => onChange({ ...value, intensity: v })}
          onReset={() => onChange({ ...value, intensity: 60 })}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberField
          label="Pitch (semitones)"
          min={-12}
          step={1}
          value={value.pitch}
          onChange={(v) => onChange({ ...value, pitch: Math.min(12, Math.max(-12, v ?? 0)) })}
        />
        <NumberField
          label="Speed (0.5–2)"
          min={0.5}
          step={0.05}
          value={value.speed}
          onChange={(v) => onChange({ ...value, speed: Math.min(2, Math.max(0.5, v ?? 1)) })}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle
          label="Noise reduction"
          checked={value.noiseReduction}
          onChange={(v) => onChange({ ...value, noiseReduction: v })}
        />
        <Toggle
          label="Speech enhancement"
          checked={value.speechEnhancement}
          onChange={(v) => onChange({ ...value, speechEnhancement: v })}
        />
        <button
          type="button"
          onClick={() => onChange({ ...defaultVoiceEffect })}
          className="text-[11px] font-semibold underline"
        >
          Restore original voice
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Voice effects are creative tools. They apply only to your own spoken audio and do not remove copyright.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live preview                                                        */
/* ------------------------------------------------------------------ */

function PreviewPlayer({
  audio,
  videoUrl,
  durationSeconds,
}: {
  audio: PlatformAudio;
  videoUrl: string | null;
  durationSeconds: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levels = effectiveLevels(audio);
  const total = durationSeconds ?? videoRef.current?.duration ?? 0;

  const gains = compareOriginal
    ? { original: 100, music: 0, voice: 0, sfx: 0 }
    : levels;

  useEffect(() => {
    const apply = (el: HTMLMediaElement | null, percent: number) => {
      if (!el) return;
      el.volume = Math.min(1, Math.max(0, percent / 100));
      el.muted = percent === 0;
    };
    apply(videoRef.current, gains.original);
    apply(musicRef.current, gains.music);
    apply(voiceRef.current, gains.voice);
    apply(sfxRef.current, gains.sfx);
  }, [gains.original, gains.music, gains.voice, gains.sfx]);

  const lanes = () => [musicRef.current, voiceRef.current, sfxRef.current];

  async function play() {
    setError(null);
    try {
      const video = videoRef.current;
      const at = video?.currentTime ?? 0;
      if (musicRef.current) musicRef.current.currentTime = Math.max(0, audio.trimStartSeconds + at - audio.musicStartSeconds);
      if (voiceRef.current) voiceRef.current.currentTime = Math.max(0, audio.voice.trimStartSeconds + at - audio.voice.startSeconds);
      if (sfxRef.current) sfxRef.current.currentTime = Math.max(0, audio.sfx.trimStartSeconds + at - audio.sfx.startSeconds);
      await Promise.all([
        video?.play(),
        ...lanes().map((el) => (el && !el.muted ? el.play() : undefined)),
      ]);
      setPlaying(true);
    } catch {
      setError("Audio preview could not start. Check that the media finished uploading.");
    }
  }

  function pause() {
    videoRef.current?.pause();
    lanes().forEach((el) => el?.pause());
    setPlaying(false);
  }

  function restart() {
    if (videoRef.current) videoRef.current.currentTime = 0;
    lanes().forEach((el) => {
      if (el) el.currentTime = 0;
    });
    setTime(0);
    if (playing) void play();
  }

  useEffect(() => () => pause(), []);

  const musicUrl = audio.mode === "music" ? audio.track?.audioUrl ?? null : null;
  const voiceUrl = audio.voice.enabled ? audio.voice.track?.audioUrl ?? null : null;
  const sfxUrl = audio.sfx.enabled ? audio.sfx.track?.audioUrl ?? null : null;

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Headphones className="size-3.5" aria-hidden /> Live preview
      </p>
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          className="max-h-56 w-full rounded-lg bg-black object-contain"
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            lanes().forEach((el) => el?.pause());
          }}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">Add a video to preview the mix.</p>
      )}
      {musicUrl && <audio ref={musicRef} src={musicUrl} preload="auto" loop={audio.loop} />}
      {voiceUrl && <audio ref={voiceRef} src={voiceUrl} preload="auto" />}
      {sfxUrl && <audio ref={sfxRef} src={sfxUrl} preload="auto" loop={audio.sfx.loop} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (playing ? pause() : void play())}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {playing ? "Pause" : "Play mix"}
        </button>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
        >
          <SkipBack className="size-3.5" aria-hidden /> Restart
        </button>
        <button
          type="button"
          aria-pressed={compareOriginal}
          onClick={() => setCompareOriginal((v) => !v)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-semibold",
            compareOriginal ? "border-primary bg-primary/10 text-primary" : "border-border",
          )}
        >
          {compareOriginal ? "Hearing original" : "Compare with original"}
        </button>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(time)} / {formatDuration(total)}
        </span>
      </div>
      <input
        type="range"
        aria-label="Seek preview"
        min={0}
        max={Math.max(1, total)}
        step={0.1}
        value={time}
        onChange={(e) => {
          const t = Number(e.target.value);
          setTime(t);
          if (videoRef.current) videoRef.current.currentTime = t;
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Preview volumes above 100% are played at 100% — the boost is applied during the final render.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lane card                                                           */
/* ------------------------------------------------------------------ */

function LaneCard({
  icon,
  title,
  children,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          {icon} {title}
        </h5>
        {right}
      </div>
      {children}
    </section>
  );
}

function SoloButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={`Solo ${label}`}
      onClick={onToggle}
      className={cn(
        "rounded-md border px-2 py-1 text-[11px] font-semibold",
        on ? "border-primary bg-primary/10 text-primary" : "border-border",
      )}
    >
      Solo
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export type AudioStudioProps = {
  scope: "global" | "platform";
  platform: SocialPlatform;
  accountLabel?: string;
  selectedPlatforms: SocialPlatform[];
  audio: PlatformAudio;
  globalAudio: PlatformAudio;
  tracks: MusicTrack[];
  isVideo: boolean;
  videoUrl?: string | null;
  videoDurationSeconds?: number | null;
  copySources?: { id: string; label: string }[];
  onChange: (next: PlatformAudio) => void;
  onCopyFrom?: (sourceId: string) => void;
  onTrackCreated: (track: MusicTrack) => void;
};

export function AudioStudio(props: AudioStudioProps) {
  const {
    scope,
    platform,
    selectedPlatforms,
    globalAudio,
    tracks,
    isVideo,
    videoUrl = null,
    videoDurationSeconds = null,
    copySources = [],
    onChange,
    onCopyFrom,
    onTrackCreated,
  } = props;

  const inherited = scope === "platform" && !props.audio.customized;
  const audio = inherited ? { ...globalAudio, customized: false } : props.audio;
  const [picking, setPicking] = useState<null | "music" | "voice" | "sfx">(null);
  const [openPreview, setOpenPreview] = useState(scope === "global");

  const set = (patch: Partial<PlatformAudio>) => onChange({ ...audio, ...patch, customized: scope === "platform" ? true : audio.customized });
  const setLane = (key: "voice" | "sfx", patch: Partial<TrackState>) =>
    set({ [key]: { ...audio[key], ...patch } } as Partial<PlatformAudio>);

  const track = audio.track;
  const blockedHere =
    scope === "platform" && track ? missingPlatforms(track, [platform]).length > 0 : false;
  const warnings = useMemo(() => validateAudio(audio, videoDurationSeconds), [audio, videoDurationSeconds]);
  const platformName = platformMap[platform]?.name ?? platform;

  useEffect(() => {
    if (audio.mode === "music" && track?.attributionRequired) {
      const credit = buildAttribution(track);
      if (audio.attributionText !== credit) onChange({ ...audio, attributionText: credit });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.mode, track?.id]);

  const musicOn = musicAllowedFor(audio, platform);

  // Platforms outside the music destinations simply reuse the original upload.
  // Nothing is sent to the mixing worker until the user opts in here.
  if (scope === "platform" && !musicOn && !audio.customized) {
    return (
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <AudioLines className="size-4" aria-hidden />
          Audio · {platformName}
        </h4>
        <dl className="grid gap-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-28 text-muted-foreground">Audio source</dt>
            <dd className="font-semibold">Original video audio</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-muted-foreground">Added music</dt>
            <dd className="font-semibold">Not applied</dd>
          </div>
        </dl>
        <p className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">
          {ORIGINAL_AUDIO_NOTICE}
        </p>
        <button
          type="button"
          onClick={() => onChange({ ...globalAudio, customized: true })}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-accent"
        >
          Customize audio for this platform
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <AudioLines className="size-4" aria-hidden />
          Music, Voice &amp; Audio Studio
          {scope === "platform" && <span className="text-muted-foreground">· {platformName}</span>}
        </h4>
        {!isVideo && (
          <span className="text-[11px] text-muted-foreground">Add a video to use music and voice-over.</span>
        )}
      </div>

      {scope === "platform" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-2 text-xs">
          <span className="font-semibold">
            {inherited ? "Using global audio settings" : "Customized for this platform"}
          </span>
          {inherited ? (
            <button
              type="button"
              onClick={() => onChange({ ...globalAudio, customized: true })}
              className="rounded-md border border-border px-2.5 py-1 font-semibold"
            >
              Customize for this platform
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ ...globalAudio, customized: false })}
              className="rounded-md border border-border px-2.5 py-1 font-semibold"
            >
              Reset to global settings
            </button>
          )}
          {copySources.length > 0 && (
            <label className="inline-flex items-center gap-1.5">
              Copy from
              <select
                aria-label="Copy audio settings from another platform"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onCopyFrom?.(e.target.value);
                  e.target.value = "";
                }}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                <option value="">Select…</option>
                {copySources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Music destination — added music is mixed only into these versions. */}
      {scope === "global" && (
        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-semibold">Music destination</legend>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={audio.youtubeOnlyMusic}
              onChange={(e) =>
                set({
                  youtubeOnlyMusic: e.target.checked,
                  ...(e.target.checked ? { musicDestinations: ["youtube" as SocialPlatform] } : {}),
                })
              }
            />
            <span className="font-semibold">Use added music for YouTube only</span>
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-xs opacity-70">
              <input type="checkbox" checked readOnly aria-label="YouTube Shorts uses the YouTube mix" />
              YouTube Shorts (uses the YouTube mix)
            </label>
            {(selectedPlatforms.length > 0 ? selectedPlatforms : (["youtube"] as SocialPlatform[]))
              .filter((p, i, arr) => arr.indexOf(p) === i)
              .map((p) => {
                const checked = audio.musicDestinations.includes(p);
                const locked = audio.youtubeOnlyMusic && p !== "youtube";
                return (
                  <label
                    key={p}
                    className={cn("inline-flex items-center gap-1.5 text-xs", locked && "opacity-50")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={(e) =>
                        set({
                          musicDestinations: e.target.checked
                            ? [...audio.musicDestinations, p]
                            : audio.musicDestinations.filter((x) => x !== p),
                        })
                      }
                    />
                    {platformMap[p]?.name ?? p}
                  </label>
                );
              })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Added music will be mixed only into the selected platform versions. Other platforms will
            keep the original video audio.
          </p>
          <p className="text-[11px] text-muted-foreground">{ORIGINAL_AUDIO_NOTICE}</p>
          <label className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold">Audio already inside the upload</span>
            <select
              aria-label="Rights for the audio already inside the uploaded video"
              value={audio.sourceAudioOwnership}
              onChange={(e) => set({ sourceAudioOwnership: e.target.value as SourceAudioOwnership })}
              className="rounded-md border border-border bg-background px-2 py-1"
            >
              {SOURCE_AUDIO_OWNERSHIP.map((o) => (
                <option key={o} value={o}>
                  {SOURCE_AUDIO_OWNERSHIP_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {MIX_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange({ ...applyMixPreset(audio, preset as MixPreset), customized: scope === "platform" ? true : audio.customized })}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold hover:bg-accent"
          >
            {MIX_PRESET_LABEL[preset]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpenPreview((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold underline"
      >
        <Headphones className="size-3.5" aria-hidden />
        {openPreview ? "Hide live preview" : "Show live preview"}
      </button>
      {openPreview && (
        <PreviewPlayer audio={audio} videoUrl={videoUrl} durationSeconds={videoDurationSeconds} />
      )}

      {/* 1. Original video audio */}
      <LaneCard
        icon={<AudioLines className="size-3.5" aria-hidden />}
        title="Original video audio"
        right={
          <div className="flex items-center gap-1.5">
            <SoloButton
              label="original audio"
              on={audio.original.solo}
              onToggle={() => set({ original: { ...audio.original, solo: !audio.original.solo } })}
            />
            <button
              type="button"
              onClick={() => onChange({ ...restoreOriginalAudio(audio), customized: scope === "platform" ? true : audio.customized })}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
            >
              Restore original
            </button>
          </div>
        }
      >
        <VolumeSlider
          label="Original video volume"
          value={audio.original.volume}
          muted={audio.original.muted}
          tooltip="The sound already inside your uploaded video. The upload itself is never modified."
          onToggleMute={() => set({ original: { ...audio.original, muted: !audio.original.muted } })}
          onChange={(v) => set({ original: { ...audio.original, volume: v }, originalVolume: v })}
          onReset={() => set({ original: { ...audio.original, volume: 100, muted: false }, originalVolume: 100 })}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <NumberField
            label="Fade in (seconds)"
            value={audio.original.fadeInSeconds}
            onChange={(v) => set({ original: { ...audio.original, fadeInSeconds: Math.max(0, v ?? 0) } })}
          />
          <NumberField
            label="Fade out (seconds)"
            value={audio.original.fadeOutSeconds}
            onChange={(v) => set({ original: { ...audio.original, fadeOutSeconds: Math.max(0, v ?? 0) } })}
          />
        </div>
        <VoiceEffectEditor
          title="Spoken voice in the video"
          value={audio.original.effect}
          onChange={(effect) => set({ original: { ...audio.original, effect } })}
        />
      </LaneCard>

      {/* 2. Background music */}
      <LaneCard
        icon={<Music className="size-3.5" aria-hidden />}
        title="Background music"
        right={
          track && (
            <div className="flex items-center gap-1.5">
              <SoloButton label="music" on={audio.musicSolo} onToggle={() => set({ musicSolo: !audio.musicSolo })} />
              <button
                type="button"
                onClick={() => setPicking("music")}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
              >
                Replace
              </button>
              <button
                type="button"
                aria-label="Remove music"
                onClick={() => set({ mode: "original", trackId: null, track: null, attributionText: "" })}
                className="grid size-7 place-items-center rounded-md border border-border"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          )
        }
      >
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {([["original", "No added music"], ["music", "Add music"], ["silent", "Silent version"]] as const).map(
            ([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={audio.mode === mode}
                disabled={!isVideo && mode !== "original"}
                onClick={() => set({ mode })}
                className={cn(
                  "rounded-full border px-3 py-1",
                  audio.mode === mode ? "border-primary bg-primary/10 text-primary" : "border-border",
                  !isVideo && mode !== "original" && "opacity-50",
                )}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {audio.mode === "music" && !track && (
          <button
            type="button"
            onClick={() => setPicking("music")}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Music className="size-3.5" aria-hidden /> Browse music
          </button>
        )}

        {audio.mode === "music" && track && (
          <div className="space-y-3">
            <div>
              <p className="truncate text-sm font-semibold">{track.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {track.artist || "Unknown artist"} · {formatDuration(track.durationSeconds)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge
                  label={audio.attachMode === "platform_attached" ? "Platform attached" : "Mixed into video"}
                  tone="info"
                />
                {licenceBadges(track, scope === "platform" ? [platform] : selectedPlatforms).map((b) => (
                  <Badge key={b.label} label={b.label} tone={b.tone} />
                ))}
              </div>
            </div>
            {blockedHere && (
              <p className="inline-flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
                <Ban className="mt-0.5 size-3" aria-hidden />
                This track is not licensed for {platformName}. Replace the music, keep the original audio only,
                upload proof of licence, or exclude this platform — other platforms are unaffected.
              </p>
            )}
            <VolumeSlider
              label="Music volume"
              value={audio.musicVolume}
              muted={audio.musicMuted}
              onToggleMute={() => set({ musicMuted: !audio.musicMuted })}
              onChange={(v) => set({ musicVolume: v })}
              onReset={() => set({ musicVolume: 25, musicMuted: false })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <NumberField label="Start in video (seconds)" value={audio.musicStartSeconds} onChange={(v) => set({ musicStartSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim start (seconds)" value={audio.trimStartSeconds} onChange={(v) => set({ trimStartSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim end (seconds)" value={audio.trimEndSeconds} placeholder="End of track" onChange={(v) => set({ trimEndSeconds: v })} />
              <NumberField label="Fade in (seconds)" value={audio.fadeInSeconds} onChange={(v) => set({ fadeInSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Fade out (seconds)" value={audio.fadeOutSeconds} onChange={(v) => set({ fadeOutSeconds: Math.max(0, v ?? 0) })} />
            </div>
            <div className="flex flex-wrap gap-4">
              <Toggle label="Loop music" checked={audio.loop} onChange={(v) => set({ loop: v })} />
              <Toggle
                label="Sync music with video length"
                hint="Trims a longer track and loops a shorter one. Speed and pitch are never changed automatically."
                checked={audio.syncWithVideo}
                onChange={(v) => set({ syncWithVideo: v })}
              />
            </div>
            {track.attributionRequired && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[11px]">
                <p className="font-semibold">Required credit (added automatically before publishing)</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans">{audio.attributionText || buildAttribution(track)}</pre>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <p className="inline-flex items-center gap-1 font-semibold text-foreground">
            <Info className="size-3" aria-hidden /> Audio sources for {platformName}
          </p>
          <p>{(PLATFORM_AUDIO_SOURCES[platform] ?? []).join(" · ")}</p>
          <p className="mt-1">
            {PLATFORM_ATTACHED_AUDIO[platform]
              ? "Platform catalogue audio is attached through the official API and is not embedded in the export."
              : "This platform has no audio-attach API available to PostFlow, so music is mixed into a separate export. PostFlow never downloads or redistributes a platform's catalogue."}
          </p>
        </div>
      </LaneCard>

      {/* 3. Voice-over */}
      <LaneCard
        icon={<Mic className="size-3.5" aria-hidden />}
        title="Voice-over"
        right={
          <div className="flex items-center gap-1.5">
            <SoloButton label="voice-over" on={audio.voice.solo} onToggle={() => setLane("voice", { solo: !audio.voice.solo })} />
            <button
              type="button"
              onClick={() => setPicking("voice")}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
            >
              {audio.voice.track ? "Replace" : "Record or upload"}
            </button>
            {audio.voice.track && (
              <button
                type="button"
                aria-label="Remove voice-over"
                onClick={() => set({ voice: { ...defaultTrackState, effect: { ...defaultVoiceEffect } } })}
                className="grid size-7 place-items-center rounded-md border border-border"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        }
      >
        {audio.voice.track ? (
          <div className="space-y-3">
            <p className="truncate text-sm font-semibold">{audio.voice.track.title}</p>
            <VolumeSlider
              label="Voice-over volume"
              value={audio.voice.volume}
              muted={audio.voice.muted}
              onToggleMute={() => setLane("voice", { muted: !audio.voice.muted })}
              onChange={(v) => setLane("voice", { volume: v })}
              onReset={() => setLane("voice", { volume: 100, muted: false })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <NumberField label="Start in video (seconds)" value={audio.voice.startSeconds} onChange={(v) => setLane("voice", { startSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim start (seconds)" value={audio.voice.trimStartSeconds} onChange={(v) => setLane("voice", { trimStartSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim end (seconds)" value={audio.voice.trimEndSeconds} placeholder="End of clip" onChange={(v) => setLane("voice", { trimEndSeconds: v })} />
              <NumberField label="Fade in (seconds)" value={audio.voice.fadeInSeconds} onChange={(v) => setLane("voice", { fadeInSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Fade out (seconds)" value={audio.voice.fadeOutSeconds} onChange={(v) => setLane("voice", { fadeOutSeconds: Math.max(0, v ?? 0) })} />
            </div>
            <VoiceEffectEditor
              title="Voice-over effects"
              value={audio.voice.effect}
              onChange={(effect) => set({ voice: { ...audio.voice, effect } })}
            />
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <Toggle
                label="Automatically lower music during voice-over"
                checked={audio.ducking.enabled}
                onChange={(v) => set({ ducking: { ...audio.ducking, enabled: v } })}
              />
              {audio.ducking.enabled && (
                <div className="space-y-2">
                  <VolumeSlider
                    label="Music volume during voice-over"
                    max={100}
                    value={audio.ducking.duckedMusicVolume}
                    onChange={(v) => set({ ducking: { ...audio.ducking, duckedMusicVolume: v } })}
                    onReset={() => set({ ducking: { ...audio.ducking, duckedMusicVolume: 10 } })}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <NumberField label="Attack (ms)" step={50} value={audio.ducking.attackMs} onChange={(v) => set({ ducking: { ...audio.ducking, attackMs: Math.max(1, v ?? 200) } })} />
                    <NumberField label="Release (ms)" step={50} value={audio.ducking.releaseMs} onChange={(v) => set({ ducking: { ...audio.ducking, releaseMs: Math.max(1, v ?? 600) } })} />
                    <NumberField label="Sensitivity" step={5} value={audio.ducking.sensitivity} onChange={(v) => set({ ducking: { ...audio.ducking, sensitivity: Math.min(100, Math.max(0, v ?? 50)) } })} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Record in PostFlow or upload your own voice. Voice effects apply only to audio you own.
          </p>
        )}
      </LaneCard>

      {/* 4. Sound effects */}
      <LaneCard
        icon={<Sparkles className="size-3.5" aria-hidden />}
        title="Sound effects"
        right={
          <div className="flex items-center gap-1.5">
            <SoloButton label="sound effects" on={audio.sfx.solo} onToggle={() => setLane("sfx", { solo: !audio.sfx.solo })} />
            <button
              type="button"
              onClick={() => setPicking("sfx")}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
            >
              {audio.sfx.track ? "Replace" : "Add effect"}
            </button>
            {audio.sfx.track && (
              <button
                type="button"
                aria-label="Remove sound effects"
                onClick={() => set({ sfx: { ...defaultTrackState, volume: 70 } })}
                className="grid size-7 place-items-center rounded-md border border-border"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        }
      >
        {audio.sfx.track ? (
          <div className="space-y-3">
            <p className="truncate text-sm font-semibold">{audio.sfx.track.title}</p>
            <VolumeSlider
              label="Sound-effects volume"
              value={audio.sfx.volume}
              muted={audio.sfx.muted}
              onToggleMute={() => setLane("sfx", { muted: !audio.sfx.muted })}
              onChange={(v) => setLane("sfx", { volume: v })}
              onReset={() => setLane("sfx", { volume: 70, muted: false })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <NumberField label="Start in video (seconds)" value={audio.sfx.startSeconds} onChange={(v) => setLane("sfx", { startSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim start (seconds)" value={audio.sfx.trimStartSeconds} onChange={(v) => setLane("sfx", { trimStartSeconds: Math.max(0, v ?? 0) })} />
              <NumberField label="Trim end (seconds)" value={audio.sfx.trimEndSeconds} placeholder="End of clip" onChange={(v) => setLane("sfx", { trimEndSeconds: v })} />
              <Toggle label="Loop effect" checked={audio.sfx.loop} onChange={(v) => setLane("sfx", { loop: v })} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Add a licensed or self-recorded sound effect layer.</p>
        )}
      </LaneCard>

      {/* Validation */}
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[11px]">
          {warnings.map((w) => (
            <li
              key={w.message}
              className={cn(
                "inline-flex items-start gap-1.5",
                w.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
              )}
            >
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {w.message}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-1 text-[11px] text-muted-foreground">
        {COPYRIGHT_NOTICES.map((note) => (
          <li key={note}>• {note}</li>
        ))}
      </ul>

      {picking && (
        <TrackPicker
          tracks={tracks}
          platform={platform}
          selectedPlatforms={selectedPlatforms}
          onCreated={onTrackCreated}
          onClose={() => setPicking(null)}
          onPick={(t) => {
            if (picking === "music") {
              set({
                mode: "music",
                trackId: t.id,
                track: t,
                musicMuted: false,
                attributionText: t.attributionRequired ? buildAttribution(t) : "",
              });
            } else if (picking === "voice") {
              set({
                voice: { ...audio.voice, enabled: true, trackId: t.id, track: t, muted: false },
              });
            } else {
              set({ sfx: { ...audio.sfx, enabled: true, trackId: t.id, track: t, muted: false } });
            }
            setPicking(null);
          }}
        />
      )}
    </section>
  );
}

export { defaultPlatformAudio };
