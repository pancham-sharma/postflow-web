import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Ban,
  Check,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/composer/post-details";
import { platformMap } from "@/lib/postflow-data";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social-platforms";
import { registerUserTrack } from "@/lib/music.functions";
import {
  COPYRIGHT_DISCLAIMER,
  LICENCE_TYPES,
  LICENCE_TYPE_LABEL,
  MUSIC_SOURCE_LABEL,
  UPLOAD_CONFIRMATION,
  UPLOAD_WARNING,
  buildAttribution,
  defaultPlatformAudio,
  formatDuration,
  licenceBadges,
  missingPlatforms,
  type BadgeTone,
  type MusicTrack,
  type PlatformAudio,
} from "@/lib/music";

const toneCls: Record<BadgeTone, string> = {
  safe: "bg-primary/10 text-primary",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-muted text-muted-foreground",
};

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", toneCls[tone])}>
      {label}
    </span>
  );
}

function Preview({ track, volume = 100 }: { track: MusicTrack; volume?: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) el.volume = Math.min(1, Math.max(0, volume / 100));
  }, [volume]);
  if (!track.audioUrl) return null;
  return (
    <>
      <button
        type="button"
        aria-label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) void el.play();
          else el.pause();
        }}
        className="grid size-8 shrink-0 place-items-center rounded-full border border-border"
      >
        {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
      </button>
      <audio
        ref={ref}
        src={track.audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Upload / record own audio                                           */
/* ------------------------------------------------------------------ */

async function sha256(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function OwnAudioForm({ onCreated }: { onCreated: (track: MusicTrack) => void }) {
  const register = useServerFn(registerUserTrack);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [licenceType, setLicenceType] = useState<(typeof LICENCE_TYPES)[number]>("owned_by_user");
  const [licenceName, setLicenceName] = useState("Original audio owned by me");
  const [licenceUrl, setLicenceUrl] = useState("");
  const [commercial, setCommercial] = useState(true);
  const [monetization, setMonetization] = useState(true);
  const [attributionRequired, setAttributionRequired] = useState(false);
  const [attributionText, setAttributionText] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([...SOCIAL_PLATFORMS]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        setFile(new File([blob], `recording-${Date.now()}.webm`, { type: "audio/webm" }));
        setRecording(false);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access was denied.");
    }
  }

  async function save() {
    if (!file) {
      toast.error("Choose or record an audio file first.");
      return;
    }
    if (!confirmed) {
      toast.error(UPLOAD_CONFIRMATION);
      return;
    }
    if (platforms.length === 0) {
      toast.error("Select the platforms this audio is licensed for.");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Your session expired — sign in again.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("music").upload(path, file, {
        contentType: file.type || "audio/mpeg",
        upsert: false,
      });
      if (error) throw error;

      const hash = await sha256(file);
      const duration = await new Promise<number>((resolve) => {
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
        el.onerror = () => resolve(0);
        el.src = URL.createObjectURL(file);
      });

      const track = await register({
        data: {
          title: title.trim() || file.name,
          artist: artist.trim(),
          source: file.name.startsWith("recording-") ? "user_recording" : "user_upload",
          audioPath: path,
          genre: "",
          mood: "",
          durationSeconds: Math.round(duration),
          licenceType,
          licenceName: licenceName.trim(),
          commercialUse: commercial,
          monetizationAllowed: monetization,
          attributionRequired,
          attributionText: attributionText.trim(),
          allowedPlatforms: platforms,
          licenceUrl: licenceUrl.trim() ? licenceUrl.trim() : null,
          originalFilename: file.name,
          fileHash: hash,
          status: "active",
          ownershipConfirmed: true,
        },
      });
      toast.success("Audio added to your workspace library.");
      onCreated(track);
      setFile(null);
      setConfirmed(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the audio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <TriangleAlert className="mr-1 inline size-3.5" aria-hidden />
        {UPLOAD_WARNING}
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold">
          <Upload className="size-3.5" aria-hidden /> Choose audio file
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => (recording ? recorder.current?.stop() : void startRecording())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold",
            recording ? "border-destructive text-destructive" : "border-border",
          )}
        >
          <Mic className="size-3.5" aria-hidden /> {recording ? "Stop recording" : "Record audio"}
        </button>
        {file && <span className="self-center text-xs text-muted-foreground">{file.name}</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputCls} placeholder="Track title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={inputCls} placeholder="Artist / creator" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <select
          className={inputCls}
          aria-label="Licence type"
          value={licenceType}
          onChange={(e) => setLicenceType(e.target.value as (typeof LICENCE_TYPES)[number])}
        >
          {LICENCE_TYPES.filter((t) => t !== "unknown").map((t) => (
            <option key={t} value={t}>
              {LICENCE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input className={inputCls} placeholder="Licence name" value={licenceName} onChange={(e) => setLicenceName(e.target.value)} />
        <input
          className={cn(inputCls, "sm:col-span-2")}
          placeholder="Licence URL or proof link (optional)"
          value={licenceUrl}
          onChange={(e) => setLicenceUrl(e.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Licensed for
        </legend>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border",
                )}
              >
                {platformMap[p]?.name ?? p}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} />
          Commercial use allowed
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={monetization} onChange={(e) => setMonetization(e.target.checked)} />
          Monetization allowed
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={attributionRequired}
            onChange={(e) => setAttributionRequired(e.target.checked)}
          />
          Attribution required
        </label>
      </div>
      {attributionRequired && (
        <input
          className={inputCls}
          placeholder="Credit text to add to the description"
          value={attributionText}
          onChange={(e) => setAttributionText(e.target.value)}
        />
      )}

      <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{UPLOAD_CONFIRMATION}</span>
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !file || !confirmed}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
        Save to my library
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Track picker                                                        */
/* ------------------------------------------------------------------ */

export function TrackPicker({
  tracks,
  platform,
  selectedPlatforms,
  onPick,
  onClose,
  onCreated,
}: {
  tracks: MusicTrack[];
  platform: SocialPlatform;
  selectedPlatforms: SocialPlatform[];
  onPick: (track: MusicTrack) => void;
  onClose: () => void;
  onCreated: (track: MusicTrack) => void;
}) {
  const [tab, setTab] = useState<"library" | "own">("library");
  const [query, setQuery] = useState("");
  const [onlyUniversal, setOnlyUniversal] = useState(true);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks
      .filter((t) =>
        !q
          ? true
          : `${t.title} ${t.artist} ${t.genre} ${t.mood}`.toLowerCase().includes(q),
      )
      .filter((t) =>
        onlyUniversal ? missingPlatforms(t, selectedPlatforms).length === 0 : true,
      );
  }, [tracks, query, onlyUniversal, selectedPlatforms]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">
            Choose music · {platformMap[platform]?.name ?? platform}
          </h3>
          <button type="button" onClick={onClose} className="text-xs font-semibold underline">
            Close
          </button>
        </div>

        <div className="mb-3 flex gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={cn("rounded-md px-3 py-1.5", tab === "library" ? "bg-primary text-primary-foreground" : "border border-border")}
          >
            Licensed library
          </button>
          <button
            type="button"
            onClick={() => setTab("own")}
            className={cn("rounded-md px-3 py-1.5", tab === "own" ? "bg-primary text-primary-foreground" : "border border-border")}
          >
            My own audio
          </button>
        </div>

        {tab === "own" ? (
          <OwnAudioForm
            onCreated={(t) => {
              onCreated(t);
              onPick(t);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  className={cn(inputCls, "pl-7")}
                  placeholder="Search music by title, artist, genre or mood"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </span>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={onlyUniversal}
                  onChange={(e) => setOnlyUniversal(e.target.checked)}
                />
                Only tracks licensed for all selected platforms
              </label>
            </div>

            {results.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                No track matches. Clear the filter, or add your own licensed audio.
              </p>
            )}

            <ul className="space-y-2">
              {results.map((track) => {
                const missing = missingPlatforms(track, [platform]);
                return (
                  <li key={track.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                    <Preview track={track} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{track.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {track.artist || "Unknown artist"} · {MUSIC_SOURCE_LABEL[track.source]} ·{" "}
                        {formatDuration(track.durationSeconds)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {licenceBadges(track, selectedPlatforms).map((b) => (
                          <Badge key={b.label} label={b.label} tone={b.tone} />
                        ))}
                      </div>
                      {missing.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          This track can only be used for the{" "}
                          {track.allowedPlatforms.map((p) => platformMap[p]?.name ?? p).join(", ")} version.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={missing.length > 0 || track.licenceType === "unknown"}
                      onClick={() => onPick(track)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Add music
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">{COPYRIGHT_DISCLAIMER}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-platform audio card                                             */
/* ------------------------------------------------------------------ */

function Slider({
  label,
  value,
  onChange,
  max = 200,
  step = 5,
  suffix = "%",
  icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
  suffix?: string;
  icon?: "volume";
}) {
  const VolIcon = value === 0 ? VolumeX : value <= max / 2 ? Volume1 : Volume2;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon === "volume" && <VolIcon className="size-3.5 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
        <span className="shrink-0 font-medium normal-case tracking-normal tabular-nums leading-none">
          {value}
          {suffix}
        </span>
      </span>
      <div className="flex h-5 items-center">
        <input
          type="range"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </label>
  );
}

/**
 * One audio card per platform card. Editing Instagram's music never touches
 * YouTube or Snapchat — each card owns its own mix.
 */
export function AudioCard({
  platform,
  selectedPlatforms,
  audio,
  tracks,
  isVideo,
  onChange,
  onTrackCreated,
}: {
  platform: SocialPlatform;
  selectedPlatforms: SocialPlatform[];
  audio: PlatformAudio;
  tracks: MusicTrack[];
  isVideo: boolean;
  onChange: (next: PlatformAudio) => void;
  onTrackCreated: (track: MusicTrack) => void;
}) {
  const [picking, setPicking] = useState(false);
  const track = audio.track;
  const blocked = track ? missingPlatforms(track, [platform]).length > 0 : false;

  function set<K extends keyof PlatformAudio>(key: K, value: PlatformAudio[K]) {
    onChange({ ...audio, [key]: value });
  }

  useEffect(() => {
    if (audio.mode === "music" && audio.track && audio.track.attributionRequired) {
      const credit = buildAttribution(audio.track);
      if (audio.attributionText !== credit) onChange({ ...audio, attributionText: credit });
    }
    if (audio.mode !== "music" && audio.attributionText) {
      onChange({ ...audio, attributionText: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.mode, audio.track?.id]);

  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <AudioLines className="size-4" aria-hidden /> Audio
        </h4>
        {!isVideo && (
          <span className="text-[11px] text-muted-foreground">Add a video to use background music.</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {(
          [
            ["original", "Keep original audio"],
            ["music", "Add music"],
            ["silent", "Silent version"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={audio.mode === mode}
            disabled={!isVideo && mode !== "original"}
            onClick={() => set("mode", mode)}
            className={cn(
              "rounded-full border px-3 py-1",
              audio.mode === mode ? "border-primary bg-primary/10 text-primary" : "border-border",
              !isVideo && mode !== "original" && "opacity-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {audio.mode === "music" && (
        <>
          {track ? (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Preview track={track} volume={audio.musicVolume} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{track.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {track.artist || "Unknown artist"} · {LICENCE_TYPE_LABEL[track.licenceType]} ·{" "}
                    {formatDuration(track.durationSeconds)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold"
                >
                  Replace audio
                </button>
                <button
                  type="button"
                  aria-label="Remove music"
                  onClick={() => onChange({ ...defaultPlatformAudio, mode: "original" })}
                  className="rounded-md border border-border p-1.5"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {licenceBadges(track, selectedPlatforms).map((b) => (
                  <Badge key={b.label} label={b.label} tone={b.tone} />
                ))}
              </div>
              {track.licenceUrl && (
                <a
                  href={track.licenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] underline"
                >
                  Licence proof
                </a>
              )}
              {blocked && (
                <p className="inline-flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
                  <Ban className="mt-0.5 size-3" aria-hidden />
                  This track is not licensed for {platformMap[platform]?.name ?? platform}. Choose
                  another track, keep the original audio, publish a silent version, or remove this
                  platform.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Music className="size-3.5" aria-hidden /> Search music
            </button>
          )}

          {track && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider
                icon="volume"
                label="Music volume"
                value={audio.musicVolume}
                onChange={(v) => set("musicVolume", v)}
              />
              <Slider
                icon="volume"
                label="Original video volume"
                value={audio.originalVolume}
                onChange={(v) => set("originalVolume", v)}
              />
              <Slider label="Fade in" value={audio.fadeInSeconds} onChange={(v) => set("fadeInSeconds", v)} max={10} step={0.5} suffix="s" />
              <Slider label="Fade out" value={audio.fadeOutSeconds} onChange={(v) => set("fadeOutSeconds", v)} max={10} step={0.5} suffix="s" />
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Trim start (seconds)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputCls}
                  value={audio.trimStartSeconds}
                  onChange={(e) => set("trimStartSeconds", Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Trim end (seconds)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputCls}
                  value={audio.trimEndSeconds ?? ""}
                  placeholder="End of track"
                  onChange={(e) =>
                    set("trimEndSeconds", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={audio.muteOriginal}
                  onChange={(e) => set("muteOriginal", e.target.checked)}
                />
                Mute original audio
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={audio.loop} onChange={(e) => set("loop", e.target.checked)} />
                Loop track
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={audio.syncWithVideo}
                  onChange={(e) => set("syncWithVideo", e.target.checked)}
                />
                Sync music with video length
              </label>
              <button
                type="button"
                onClick={() => onChange({ ...defaultPlatformAudio, mode: "original" })}
                className="justify-self-start rounded-md border border-border px-2.5 py-1 text-xs font-semibold"
              >
                Restore original audio
              </button>
            </div>
          )}

          {track?.attributionRequired && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[11px]">
              <p className="font-semibold">Required credit (added automatically before publishing)</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{audio.attributionText || buildAttribution(track)}</pre>
            </div>
          )}
        </>
      )}

      {audio.mode === "original" && (
        <p className="text-[11px] text-muted-foreground">
          The video keeps its own sound. You remain responsible for any music already inside it.
        </p>
      )}
      {audio.mode === "silent" && (
        <p className="text-[11px] text-muted-foreground">
          A silent copy is rendered for this platform. The original upload is never changed.
        </p>
      )}

      {picking && (
        <TrackPicker
          tracks={tracks}
          platform={platform}
          selectedPlatforms={selectedPlatforms}
          onCreated={onTrackCreated}
          onClose={() => setPicking(false)}
          onPick={(t) => {
            onChange({
              ...audio,
              mode: "music",
              trackId: t.id,
              track: t,
              attributionText: t.attributionRequired ? buildAttribution(t) : "",
            });
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}