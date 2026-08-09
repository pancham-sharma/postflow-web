import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Music, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/composer/audio-card";
import { inputCls } from "@/components/form-styles";
import { platformMap } from "@/lib/postflow-data";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";
import {
  deleteMusicTrack,
  listMusicTracks,
  upsertLibraryTrack,
} from "@/lib/music.functions";
import {
  COPYRIGHT_DISCLAIMER,
  LICENCE_TYPES,
  LICENCE_TYPE_LABEL,
  MUSIC_SOURCE_LABEL,
  formatDuration,
  licenceBadges,
} from "@/lib/music";

export const Route = createFileRoute("/_authenticated/app/admin/music")({
  head: () => ({
    meta: [
      { title: "Music library — PostFlow admin" },
      {
        name: "description",
        content:
          "Curate the PostFlow copyright-safe music library: add licensed tracks, record licence evidence and control which platforms each track may be used on.",
      },
      { property: "og:title", content: "Music library — PostFlow admin" },
      {
        property: "og:description",
        content: "Add and remove licensed background music available to every workspace.",
      },
    ],
  }),
  component: AdminMusic,
});

function AdminMusic() {
  const queryClient = useQueryClient();
  const fetchTracks = useServerFn(listMusicTracks);
  const upsert = useServerFn(upsertLibraryTrack);
  const remove = useServerFn(deleteMusicTrack);

  const { data: tracks, isLoading } = useQuery({
    queryKey: ["music-tracks"],
    queryFn: () => fetchTracks(),
  });

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    artist: "",
    audioUrl: "",
    genre: "",
    mood: "",
    durationSeconds: 0,
    licenceType: "creative_commons" as (typeof LICENCE_TYPES)[number],
    licenceName: "",
    licenceUrl: "",
    commercialUse: true,
    monetizationAllowed: true,
    attributionRequired: false,
    attributionText: "",
    allowedPlatforms: [...SOCIAL_PLATFORMS] as SocialPlatform[],
  });

  const shared = (tracks ?? []).filter(
    (t) => t.source !== "user_upload" && t.source !== "user_recording",
  );

  async function save() {
    if (!form.title.trim() || !form.audioUrl.trim()) {
      toast.error("A title and a public audio URL are required.");
      return;
    }
    setBusy(true);
    try {
      await upsert({
        data: {
          title: form.title.trim(),
          artist: form.artist.trim(),
          source: "postflow_library",
          audioUrl: form.audioUrl.trim(),
          genre: form.genre.trim(),
          mood: form.mood.trim(),
          durationSeconds: Number(form.durationSeconds) || 0,
          licenceType: form.licenceType,
          licenceName: form.licenceName.trim(),
          licenceUrl: form.licenceUrl.trim() ? form.licenceUrl.trim() : null,
          commercialUse: form.commercialUse,
          monetizationAllowed: form.monetizationAllowed,
          attributionRequired: form.attributionRequired,
          attributionText: form.attributionText.trim(),
          allowedPlatforms: form.allowedPlatforms,
          status: "active",
          ownershipConfirmed: true,
        },
      });
      toast.success("Track added to the shared library.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["music-tracks"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the track.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <Music className="size-4" aria-hidden /> Copyright-safe music library
          </h2>
          <p className="text-sm text-muted-foreground">
            Only add tracks whose licence you can evidence. Every field here is shown to users
            before they publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden /> Add track
        </button>
      </div>

      {open && (
        <section className="grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={inputCls} placeholder="Artist" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <input className={cn(inputCls, "sm:col-span-2")} placeholder="Public audio URL (https)" value={form.audioUrl} onChange={(e) => setForm({ ...form, audioUrl: e.target.value })} />
          <input className={inputCls} placeholder="Genre" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
          <input className={inputCls} placeholder="Mood" value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} />
          <input
            className={inputCls}
            type="number"
            min={0}
            placeholder="Duration (seconds)"
            value={form.durationSeconds || ""}
            onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })}
          />
          <select
            className={inputCls}
            aria-label="Licence type"
            value={form.licenceType}
            onChange={(e) => setForm({ ...form, licenceType: e.target.value as (typeof LICENCE_TYPES)[number] })}
          >
            {LICENCE_TYPES.filter((t) => t !== "unknown").map((t) => (
              <option key={t} value={t}>
                {LICENCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder="Licence name (e.g. CC BY 4.0)" value={form.licenceName} onChange={(e) => setForm({ ...form, licenceName: e.target.value })} />
          <input className={inputCls} placeholder="Licence URL" value={form.licenceUrl} onChange={(e) => setForm({ ...form, licenceUrl: e.target.value })} />

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const on = form.allowedPlatforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setForm({
                      ...form,
                      allowedPlatforms: on
                        ? form.allowedPlatforms.filter((x) => x !== p)
                        : [...form.allowedPlatforms, p],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  {platformMap[p]?.name ?? p}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 text-xs sm:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.commercialUse} onChange={(e) => setForm({ ...form, commercialUse: e.target.checked })} />
              Commercial use
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.monetizationAllowed} onChange={(e) => setForm({ ...form, monetizationAllowed: e.target.checked })} />
              Monetization
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.attributionRequired} onChange={(e) => setForm({ ...form, attributionRequired: e.target.checked })} />
              Attribution required
            </label>
          </div>
          {form.attributionRequired && (
            <input
              className={cn(inputCls, "sm:col-span-2")}
              placeholder="Credit text"
              value={form.attributionText}
              onChange={(e) => setForm({ ...form, attributionText: e.target.value })}
            />
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="justify-self-start rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            {busy ? <Loader2 className="mr-1 inline size-3.5 animate-spin" aria-hidden /> : null}
            Save track
          </button>
        </section>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tracks…</p>
      ) : shared.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          The shared library is empty. Add a licensed track to make it available to every workspace.
        </p>
      ) : (
        <ul className="space-y-2">
          {shared.map((track) => (
            <li key={track.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.artist || "Unknown artist"} · {MUSIC_SOURCE_LABEL[track.source]} ·{" "}
                  {formatDuration(track.durationSeconds)} ·{" "}
                  {track.allowedPlatforms.map((p) => platformMap[p]?.name ?? p).join(", ") || "no platforms"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {licenceBadges(track, track.allowedPlatforms).map((b) => (
                    <Badge key={b.label} label={b.label} tone={b.tone} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${track.title}`}
                onClick={async () => {
                  try {
                    await remove({ data: { id: track.id } });
                    await queryClient.invalidateQueries({ queryKey: ["music-tracks"] });
                    toast.success("Track removed.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not remove the track.");
                  }
                }}
                className="rounded-md border border-border p-2"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">{COPYRIGHT_DISCLAIMER}</p>
    </div>
  );
}
