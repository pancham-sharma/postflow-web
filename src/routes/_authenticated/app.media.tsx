import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  FolderPlus,
  Grid2X2,
  List,
  Loader2,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearUnusedMedia,
  createMediaFolder,
  deleteMediaFolder,
  getMediaLibrary,
  getMediaSignedUrl,
  preflightMediaUpload,
  purgeMediaAssets,
  registerMediaAsset,
  renameMediaFolder,
  setMediaTrashed,
  updateMediaAsset,
} from "@/lib/media.functions";
import {
  MEDIA_BUCKET,
  aspectLabel,
  createUserPostStoragePath,
  fileChecksum,
  formatBytes,
  formatDuration,
  probeMedia,
  validateFile,
  type MediaAsset,
} from "@/lib/media-library";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { uploadViaResumableTus } from "@/lib/tus-upload";
import { useJobRealtime } from "@/hooks/use-job-realtime";

export const Route = createFileRoute("/_authenticated/app/media")({
  // ?upload=1 comes from the dashboard "Upload media" quick action.
  validateSearch: (s: Record<string, unknown>): { upload?: string } =>
    s['upload'] === "1" ? { upload: "1" } : {},
  head: () => ({
    meta: [
      { title: "Media Library — PostFlow" },
      { name: "description", content: "Upload, organise and search every image and video with folders, tags and live storage usage." },
      { property: "og:title", content: "Media Library — PostFlow" },
      { property: "og:description", content: "Folders, tags, storage usage and post usage counts for all your media." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MediaLibraryPage,
});

const filters = ["All", "Images", "Videos", "Used", "Unused", "Trash"] as const;
type Filter = (typeof filters)[number];

const PAGE_SIZE = 24;

type UploadTask = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error" | "cancelled";
  message?: string;
  controller: AbortController;
  file: File;
};

function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const fetchLibrary = useServerFn(getMediaLibrary);
  const preflightUpload = useServerFn(preflightMediaUpload);
  const register = useServerFn(registerMediaAsset);
  const updateAsset = useServerFn(updateMediaAsset);
  const trashAsset = useServerFn(setMediaTrashed);
  const purge = useServerFn(purgeMediaAssets);
  const addFolder = useServerFn(createMediaFolder);
  const renameFolder = useServerFn(renameMediaFolder);
  const deleteFolder = useServerFn(deleteMediaFolder);
  const signUrl = useServerFn(getMediaSignedUrl);
  const clearUnused = useServerFn(clearUnusedMedia);

  useJobRealtime([["media-library"], ["media-assets"]]);

  const [filter, setFilter] = useState<Filter>("All");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useDebouncedValue(query, 300);
  const { upload: autoUpload } = Route.useSearch();
  const openedPicker = useRef(false);

  // Arriving from the dashboard quick action opens the file picker immediately.
  useEffect(() => {
    if (autoUpload !== "1" || openedPicker.current) return;
    openedPicker.current = true;
    fileInput.current?.click();
  }, [autoUpload]);

  const library = useQuery({
    queryKey: ["media-library"],
    queryFn: () => fetchLibrary({}),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["media-library"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  const assets = library.data?.assets ?? [];
  const folders = library.data?.folders ?? [];
  const storage = library.data?.storage;

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((m) => {
      if (filter === "Trash" ? !m.deletedAt : Boolean(m.deletedAt)) return false;
      if (folderId && m.folderId !== folderId) return false;
      if (q && !m.fileName.toLowerCase().includes(q) && !m.tags.some((t) => t.toLowerCase().includes(q)))
        return false;
      if (filter === "Images") return m.mediaType === "image";
      if (filter === "Videos") return m.mediaType === "video";
      if (filter === "Used") return m.usedIn > 0;
      if (filter === "Unused") return m.usedIn === 0;
      return true;
    });
  }, [assets, filter, folderId, search]);

  const page = useMemo(() => items.slice(0, visible), [items, visible]);
  const open = useMemo(() => assets.find((m) => m.id === openId), [assets, openId]);

  const usedPct = storage ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100)) : 0;

  async function runUpload(file: File) {
    const check = validateFile(file);
    if ("error" in check) {
      toast.error(check.error);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("Your session expired — sign in again.");
      return;
    }

    const taskId = `${Date.now()}-${file.name}`;
    const controller = new AbortController();
    setUploads((prev) => [
      ...prev,
      { id: taskId, name: file.name, size: file.size, progress: 5, status: "uploading", controller, file },
    ]);
    const patch = (next: Partial<UploadTask>) =>
      setUploads((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...next } : t)));

    let uploadedPath: string | null = null;
    try {
      const [meta, checksum] = await Promise.all([probeMedia(file, check.kind), fileChecksum(file)]);
      patch({ progress: 25 });
      await preflightUpload({
        data: {
          fileName: file.name,
          mimeType: file.type as never,
          fileSize: file.size,
          checksum,
        },
      });
      patch({ progress: 35 });
      const path = createUserPostStoragePath(uid, file.name);
      uploadedPath = path;
      // TUS resumable upload: bypasses the 50 MB global HTTP limit and uses
      // the bucket-level 512 MiB limit instead.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your session expired — sign in again.");
      const supabaseUrl =
        (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ||
        (import.meta.env["VITE_SUPABASE_PROJECT_URL"] as string | undefined) ||
        "";
      await uploadViaResumableTus({
        supabaseUrl,
        accessToken,
        bucket: MEDIA_BUCKET,
        path,
        file,
        contentType: file.type,
        onProgress: (pct) => patch({ progress: 35 + Math.round(pct * 0.45) }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        patch({ status: "cancelled", message: "Cancelled" });
        return;
      }
      patch({ progress: 80 });

      await register({
        data: {
          storagePath: path,
          fileName: file.name,
          mimeType: file.type as never,
          fileSize: file.size,
          width: meta.width,
          height: meta.height,
          durationSeconds: meta.duration,
          aspectRatio: aspectLabel(meta.width, meta.height),
          checksum,
          folderId,
          altText: "",
        },
      });
      patch({ progress: 100, status: "done" });
      toast.success(`${file.name} added to your library.`);
      invalidate();
      setTimeout(() => setUploads((prev) => prev.filter((t) => t.id !== taskId)), 2500);
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(MEDIA_BUCKET).remove([uploadedPath]);
      }
      patch({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    for (const file of Array.from(list)) await runUpload(file);
    if (fileInput.current) fileInput.current.value = "";
  }

  const folderMutation = useMutation({
    mutationFn: async (name: string) => addFolder({ data: { name } }),
    onSuccess: () => {
      toast.success("Folder created.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trashMutation = useMutation({
    mutationFn: async (vars: { ids: string[]; trashed: boolean }) => trashAsset({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.trashed ? "Moved to Trash." : "Restored.");
      setOpenId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeMutation = useMutation({
    mutationFn: async (vars: { ids?: string[]; allTrashed?: boolean }) =>
      purge({ data: { ids: vars.ids ?? [], allTrashed: vars.allTrashed ?? false } }),
    onSuccess: (r) => {
      toast.success(`${r.count} file${r.count === 1 ? "" : "s"} permanently deleted.`);
      setOpenId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      fileName?: string;
      folderId?: string | null;
      altText?: string;
      tags?: string[];
    }) => updateAsset({ data: vars }),
    onSuccess: () => {
      toast.success("Media updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function preview(asset: MediaAsset) {
    setOpenId(asset.id);
    setPreviewUrl(null);
    try {
      const { url } = await signUrl({ data: { id: asset.id } });
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    }
  }

  async function confirmTrash(asset: MediaAsset) {
    const warn =
      asset.usedIn > 0
        ? `"${asset.fileName}" is used in ${asset.usedIn} post${asset.usedIn === 1 ? "" : "s"}. Move it to Trash anyway?`
        : `Move "${asset.fileName}" to Trash?`;
    if (!window.confirm(warn)) return;
    trashMutation.mutate({ ids: [asset.id], trashed: true });
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        multiple
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Media library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {storage
              ? `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.limitBytes)} used · ${storage.fileCount} file${storage.fileCount === 1 ? "" : "s"}`
              : "Loading storage usage…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Search name or tag"
              aria-label="Search media"
              className="w-full min-w-0 rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:w-56"
            />
          </div>
          <div className="flex rounded-md border border-primary/40">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn("rounded-l-md px-2.5 py-2", view === "grid" && "bg-primary text-primary-foreground")}
            >
              <Grid2X2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={cn("rounded-r-md px-2.5 py-2", view === "list" && "bg-primary text-primary-foreground")}
            >
              <List className="size-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Folder name");
              if (name?.trim()) folderMutation.mutate(name.trim());
            }}
            disabled={folderMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-60"
          >
            <FolderPlus className="size-4" aria-hidden /> Folder
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90"
          >
            <Upload className="size-4" aria-hidden /> Upload media
          </button>
        </div>
      </div>

      {storage && (
        <section className="rounded-2xl border border-border p-4" aria-label="Storage usage">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold">Storage · {usedPct}% used</p>
            <p className="text-muted-foreground">
              {formatBytes(Math.max(0, storage.limitBytes - storage.usedBytes))} remaining
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["Images", formatBytes(storage.imageBytes)],
              ["Videos", formatBytes(storage.videoBytes)],
              ["Other", formatBytes(storage.otherBytes)],
              ["Trash", formatBytes(storage.trashBytes)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={async () => {
                const result = await clearUnused({ data: { apply: false } });
                if (result.items.length === 0) {
                  toast.success("No unused media found.");
                  return;
                }
                const list = result.items.slice(0, 8).map((i) => i.fileName).join(", ");
                if (
                  window.confirm(
                    `Move ${result.items.length} unused file(s) to Trash and reclaim ${formatBytes(result.reclaimedBytes)}?\n\n${list}${result.items.length > 8 ? "…" : ""}`,
                  )
                ) {
                  await clearUnused({ data: { apply: true } });
                  toast.success("Unused media moved to Trash.");
                  invalidate();
                }
              }}
              className="rounded-md border border-primary/50 px-3 py-1.5 hover:bg-accent"
            >
              Clear unused media
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Permanently delete everything in Trash? This cannot be undone."))
                  purgeMutation.mutate({ allTrashed: true });
              }}
              disabled={purgeMutation.isPending}
              className="rounded-md border border-dashed border-primary/60 px-3 py-1.5 hover:bg-accent disabled:opacity-60"
            >
              Empty Trash
            </button>
          </div>
        </section>
      )}

      {uploads.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-border p-4" aria-label="Uploads">
          {uploads.map((task) => (
            <div key={task.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-medium">{task.name}</p>
                <span className="text-xs text-muted-foreground">{formatBytes(task.size)}</span>
                {task.status === "uploading" && (
                  <button
                    type="button"
                    onClick={() => task.controller.abort()}
                    className="rounded-md border border-primary/50 px-2 py-0.5 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                )}
                {task.status === "error" && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploads((prev) => prev.filter((t) => t.id !== task.id));
                      void runUpload(task.file);
                    }}
                    className="rounded-md border border-primary/50 px-2 py-0.5 text-xs font-semibold"
                  >
                    Retry
                  </button>
                )}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className={cn("h-full rounded-full", task.status === "error" ? "hatch" : "bg-primary")}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              {task.message && <p className="mt-1 text-xs text-muted-foreground">{task.message}</p>}
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setVisible(PAGE_SIZE);
            }}
            aria-pressed={filter === f}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              filter === f ? "bg-primary text-primary-foreground" : "border border-primary/40 hover:bg-accent",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFolderId(null)}
          aria-pressed={folderId === null}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold",
            folderId === null ? "bg-primary text-primary-foreground" : "border border-primary/40 hover:bg-accent",
          )}
        >
          All folders
        </button>
        {folders.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFolderId(f.id)}
              aria-pressed={folderId === f.id}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold",
                folderId === f.id ? "bg-primary text-primary-foreground" : "border border-primary/40 hover:bg-accent",
              )}
            >
              {f.name} · {f.assetCount}
            </button>
            <button
              type="button"
              aria-label={`Rename folder ${f.name}`}
              onClick={async () => {
                const name = window.prompt("Rename folder", f.name);
                if (!name?.trim()) return;
                await renameFolder({ data: { id: f.id, name: name.trim() } });
                invalidate();
              }}
              className="rounded-md border border-primary/40 px-1.5 py-1.5 text-[10px] font-semibold hover:bg-accent"
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete folder ${f.name}`}
              onClick={async () => {
                if (!window.confirm(`Delete the folder "${f.name}"?`)) return;
                try {
                  await deleteFolder({ data: { id: f.id } });
                  if (folderId === f.id) setFolderId(null);
                  toast.success("Folder deleted.");
                  invalidate();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not delete folder.");
                }
              }}
              className="rounded-md border border-dashed border-primary/50 px-1.5 py-1.5 hover:bg-accent"
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>

      {library.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-primary/10" />
          ))}
        </div>
      ) : library.isError ? (
        <div className="rounded-2xl border border-dashed border-primary/60 p-6 text-center">
          <p className="font-semibold">Could not load your media library.</p>
          <button
            type="button"
            onClick={() => void library.refetch()}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mesh-vanilla rounded-2xl border border-dashed border-primary/50 px-6 py-16 text-center">
          <p className="text-base font-semibold">
            {assets.length === 0 ? "Your library is empty" : "No media matches this filter"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {assets.length === 0 ? "Upload an image or video to get started." : "Try another filter or search term."}
          </p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Upload className="size-4" aria-hidden /> Upload media
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {page.map((m) => (
            <article key={m.id} className="overflow-hidden rounded-2xl border border-border">
              <div className="mesh-vanilla relative aspect-[4/3] bg-primary/10">
                {m.aspectRatio && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {m.aspectRatio}
                  </span>
                )}
                {m.mediaType === "video" && (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-background/80 px-2 py-0.5 text-[10px]">
                    <Play className="size-3" aria-hidden /> {formatDuration(m.durationSeconds)}
                  </span>
                )}
                {m.deletedAt && (
                  <span className="absolute right-2 top-2 rounded-full border border-dashed border-primary/60 px-2 py-0.5 text-[10px] font-semibold">
                    In Trash
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="truncate text-sm font-semibold">{m.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.mimeType.split("/")[1]?.toUpperCase()} ·{" "}
                  {m.width && m.height ? `${m.width}×${m.height}` : "—"} · {formatBytes(m.fileSize)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString()} · used in {m.usedIn} post
                  {m.usedIn === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => void preview(m)}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground"
                  >
                    Details
                  </button>
                  {m.deletedAt ? (
                    <>
                      <button
                        type="button"
                        onClick={() => trashMutation.mutate({ ids: [m.id], trashed: false })}
                        className="rounded-md border border-primary/50 px-2.5 py-1.5 hover:bg-accent"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete "${m.fileName}"?`))
                            purgeMutation.mutate({ ids: [m.id] });
                        }}
                        className="rounded-md border border-dashed border-primary/50 px-2.5 py-1.5 hover:bg-accent"
                      >
                        Delete forever
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void confirmTrash(m)}
                      className="rounded-md border border-dashed border-primary/50 px-2.5 py-1.5 hover:bg-accent"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Dimensions</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium">{m.fileName}</td>
                  <td className="px-4 py-3">{m.mediaType}</td>
                  <td className="px-4 py-3">{formatBytes(m.fileSize)}</td>
                  <td className="px-4 py-3">{m.width && m.height ? `${m.width}×${m.height}` : "—"}</td>
                  <td className="px-4 py-3">{new Date(m.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{m.usedIn}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void preview(m)}
                      className="rounded-md border border-primary/50 px-2.5 py-1 text-xs font-semibold hover:bg-accent"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.length < items.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="w-full rounded-md border border-primary/50 px-4 py-3 text-sm font-semibold hover:bg-accent"
        >
          Load more media ({items.length - page.length} remaining)
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-primary/30" role="dialog" aria-modal="true">
          <div className="h-full w-full max-w-md overflow-y-auto bg-background p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="break-words text-lg font-semibold">{open.fileName}</h2>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close details"
                className="rounded-md border border-primary/50 px-2.5 py-1 text-xs font-semibold"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mesh-vanilla mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-primary/10">
              {!previewUrl ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : open.mediaType === "video" ? (
                <video
                  src={previewUrl}
                  controls
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={open.altText ?? open.fileName}
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              )}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
              {[
                ["Type", open.mimeType],
                ["Dimensions", open.width && open.height ? `${open.width}×${open.height}` : "—"],
                ["Aspect ratio", open.aspectRatio ?? "—"],
                ["File size", formatBytes(open.fileSize)],
                ["Duration", formatDuration(open.durationSeconds)],
                ["Uploaded", new Date(open.createdAt).toLocaleString()],
                ["Folder", folders.find((f) => f.id === open.folderId)?.name ?? "None"],
                ["Used in", `${open.usedIn} post${open.usedIn === 1 ? "" : "s"}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                detailMutation.mutate({
                  id: open.id,
                  fileName: String(form.get("fileName") ?? "").trim(),
                  altText: String(form.get("altText") ?? "").trim(),
                  folderId: (String(form.get("folderId") ?? "") || null) as string | null,
                  tags: String(form.get("tags") ?? "")
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                });
              }}
            >
              <div>
                <label htmlFor="fileName" className="text-xs font-semibold">File name</label>
                <input
                  id="fileName"
                  name="fileName"
                  defaultValue={open.fileName}
                  maxLength={200}
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="altText" className="text-xs font-semibold">Alt text</label>
                <input
                  id="altText"
                  name="altText"
                  defaultValue={open.altText ?? ""}
                  maxLength={500}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="tags" className="text-xs font-semibold">Tags (comma separated)</label>
                <input
                  id="tags"
                  name="tags"
                  defaultValue={open.tags.join(", ")}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="folderId" className="text-xs font-semibold">Folder</label>
                <select
                  id="folderId"
                  name="folderId"
                  defaultValue={open.folderId ?? ""}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">No folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={detailMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {detailMutation.isPending ? "Saving…" : "Save changes"}
                </button>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    download={open.fileName}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 px-3 py-2 text-sm font-semibold hover:bg-accent"
                  >
                    <Download className="size-4" aria-hidden /> Download
                  </a>
                )}
                {!open.deletedAt && (
                  <button
                    type="button"
                    onClick={() => void confirmTrash(open)}
                    className="rounded-md border border-dashed border-primary/60 px-3 py-2 text-sm font-semibold hover:bg-accent"
                  >
                    Move to Trash
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
