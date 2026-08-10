import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_BUCKET,
  formatBytes,
  type MediaAsset,
  type MediaFolder,
  type StorageUsage,
} from "@/lib/media-library";

const ALL_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME] as const;

export type MediaLibraryData = {
  folders: MediaFolder[];
  assets: MediaAsset[];
  storage: StorageUsage;
};

type AssetRow = {
  id: string;
  folder_id: string | null;
  file_name: string;
  media_type: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  alt_text: string | null;
  tags: string[] | null;
  processing_status: string;
  storage_path: string;
  created_at: string;
  deleted_at: string | null;
};

function toAsset(row: AssetRow, usage: Map<string, number>): MediaAsset {
  return {
    id: row.id,
    folderId: row.folder_id,
    fileName: row.file_name,
    mediaType: row.media_type === "video" ? "video" : "image",
    mimeType: row.mime_type,
    fileSize: Number(row.file_size ?? 0),
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    aspectRatio: row.aspect_ratio,
    altText: row.alt_text,
    tags: row.tags ?? [],
    processingStatus: row.processing_status,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    usedIn: usage.get(row.storage_path) ?? 0,
  };
}

/** Folders, assets (including trash) and real storage accounting for the workspace. */
export const getMediaLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MediaLibraryData> => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const { supabase } = context;

    const [foldersRes, assetsRes, limitRes, postMediaRes] = await Promise.all([
      supabase
        .from("media_folders")
        .select("id, name, created_at")
        .eq("workspace_id", workspaceId)
        .order("name"),
      supabase
        .from("media_assets")
        .select(
          "id, folder_id, file_name, media_type, mime_type, file_size, width, height, duration_seconds, aspect_ratio, alt_text, tags, processing_status, storage_path, created_at, deleted_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("workspace_storage")
        .select("storage_limit_bytes")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("social_post_media")
        .select("storage_path, media_type, mime_type, file_size")
        .eq("workspace_id", workspaceId),
    ]);
    if (foldersRes.error) throw foldersRes.error;
    if (assetsRes.error) throw assetsRes.error;
    if (postMediaRes.error) throw postMediaRes.error;

    const usage = new Map<string, number>();
    for (const row of postMediaRes.data ?? []) {
      usage.set(row.storage_path, (usage.get(row.storage_path) ?? 0) + 1);
    }

    const assets = (assetsRes.data ?? []).map((row) => toAsset(row as AssetRow, usage));
    const counts = new Map<string, number>();
    for (const asset of assets) {
      if (asset.deletedAt || !asset.folderId) continue;
      counts.set(asset.folderId, (counts.get(asset.folderId) ?? 0) + 1);
    }

    const live = assets.filter((a) => !a.deletedAt);
    const storedObjects = new Map<string, { fileSize: number; mediaType: string; deleted: boolean }>();
    for (const asset of live) {
      storedObjects.set(asset.storagePath, {
        fileSize: asset.fileSize,
        mediaType: asset.mediaType,
        deleted: false,
      });
    }
    for (const row of postMediaRes.data ?? []) {
      if (!row.storage_path || storedObjects.has(row.storage_path)) continue;
      storedObjects.set(row.storage_path, {
        fileSize: Number(row.file_size ?? 0),
        mediaType: row.media_type || (String(row.mime_type ?? "").startsWith("video/") ? "video" : "image"),
        deleted: false,
      });
    }
    const stored = [...storedObjects.values()].filter((item) => !item.deleted);
    const storage: StorageUsage = {
      limitBytes: Number(limitRes.data?.storage_limit_bytes ?? 10737418240),
      usedBytes: stored.reduce((sum, a) => sum + a.fileSize, 0),
      imageBytes: stored.filter((a) => a.mediaType === "image").reduce((s, a) => s + a.fileSize, 0),
      videoBytes: stored.filter((a) => a.mediaType === "video").reduce((s, a) => s + a.fileSize, 0),
      otherBytes: 0,
      trashBytes: assets.filter((a) => a.deletedAt).reduce((s, a) => s + a.fileSize, 0),
      fileCount: stored.length,
    };
    storage.otherBytes = Math.max(0, storage.usedBytes - storage.imageBytes - storage.videoBytes);

    return {
      folders: (foldersRes.data ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.created_at,
        assetCount: counts.get(f.id) ?? 0,
      })),
      assets,
      storage,
    };
  });

const registerInput = z.object({
  storagePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALL_MIME),
  fileSize: z.number().int().positive(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  durationSeconds: z.number().positive().nullable().default(null),
  aspectRatio: z.string().trim().max(20).nullable().default(null),
  checksum: z.string().trim().max(128).nullable().default(null),
  folderId: z.string().uuid().nullable().default(null),
  altText: z.string().trim().max(500).default(""),
});

const uploadPreflightInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALL_MIME),
  fileSize: z.number().int().positive(),
  checksum: z.string().trim().max(128).nullable().default(null),
});

export type MediaUploadPreflight = {
  ok: true;
  storage: Pick<StorageUsage, "limitBytes" | "usedBytes"> & { remainingBytes: number };
};

export const preflightMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadPreflightInput.parse(data))
  .handler(async ({ data, context }): Promise<MediaUploadPreflight> => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const kind = (ALLOWED_VIDEO_MIME as readonly string[]).includes(data.mimeType)
      ? "video"
      : "image";
    const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (data.fileSize > max) {
      throw new Error(`${data.fileName} is too large. The ${kind} upload limit is ${formatBytes(max)}.`);
    }

    const { supabase } = context;
    const [limitRow, existing, postMedia] = await Promise.all([
      supabase
        .from("workspace_storage")
        .select("storage_limit_bytes")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("media_assets")
        .select("storage_path, file_size, checksum, file_name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
      supabase
        .from("social_post_media")
        .select("storage_path, file_size")
        .eq("workspace_id", workspaceId),
    ]);
    if (existing.error) throw existing.error;
    if (postMedia.error) throw postMedia.error;

    const usedByPath = new Map<string, number>();
    for (const row of existing.data ?? []) usedByPath.set(row.storage_path, Number(row.file_size ?? 0));
    for (const row of postMedia.data ?? []) {
      if (!usedByPath.has(row.storage_path)) usedByPath.set(row.storage_path, Number(row.file_size ?? 0));
    }
    const usedBytes = [...usedByPath.values()].reduce((sum, size) => sum + size, 0);
    const limitBytes = Number(limitRow.data?.storage_limit_bytes ?? 10737418240);
    const remainingBytes = Math.max(0, limitBytes - usedBytes);
    if (data.fileSize > remainingBytes) {
      throw new Error(
        `Not enough storage left. ${formatBytes(remainingBytes)} available, ${formatBytes(data.fileSize)} selected.`,
      );
    }
    if (data.checksum) {
      const dupe = (existing.data ?? []).find((r) => r.checksum === data.checksum);
      if (dupe) throw new Error(`This file is already in your library as "${dupe.file_name}".`);
    }

    return { ok: true, storage: { limitBytes, usedBytes, remainingBytes } };
  });

/** Records an uploaded object as a library asset after server-side validation. */
export const registerMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registerInput.parse(data))
  .handler(async ({ data, context }) => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const { supabase, userId } = context;

    const kind = (ALLOWED_VIDEO_MIME as readonly string[]).includes(data.mimeType)
      ? "video"
      : "image";
    const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (data.fileSize > max) throw new Error("This file is larger than the allowed size.");
    // Never trust a client path: it must live under this user's own prefix.
    const ownsPath =
      data.storagePath.startsWith(`users/${userId}/`) || data.storagePath.startsWith(`${userId}/`);
    if (!ownsPath || data.storagePath.includes("..") || data.storagePath.startsWith("/")) {
      throw new Error("Invalid upload path.");
    }

    // Verify the file's real signature — a renamed script/SVG/HTML payload with an
    // allowed mime type is rejected and removed from storage.
    const head = await supabase.storage.from(MEDIA_BUCKET).download(data.storagePath);
    if (head.error || !head.data) throw new Error("We couldn't read the uploaded file.");
    const bytes = new Uint8Array((await head.data.slice(0, 32).arrayBuffer()) as ArrayBuffer);
    const { signatureMatchesMime } = await import("@/lib/media-signature.server");
    if (!signatureMatchesMime(bytes, data.mimeType)) {
      await supabase.storage.from(MEDIA_BUCKET).remove([data.storagePath]);
      throw new Error("This file's contents don't match its type, so it was rejected.");
    }


    const [limitRow, existing, postMedia] = await Promise.all([
      supabase
        .from("workspace_storage")
        .select("storage_limit_bytes")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("media_assets")
        .select("storage_path, file_size, checksum, file_name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
      supabase
        .from("social_post_media")
        .select("storage_path, file_size")
        .eq("workspace_id", workspaceId),
    ]);
    if (existing.error) throw existing.error;
    if (postMedia.error) throw postMedia.error;

    const usedByPath = new Map<string, number>();
    for (const row of existing.data ?? []) usedByPath.set(row.storage_path, Number(row.file_size ?? 0));
    for (const row of postMedia.data ?? []) {
      if (!usedByPath.has(row.storage_path)) usedByPath.set(row.storage_path, Number(row.file_size ?? 0));
    }
    const used = [...usedByPath.values()].reduce((sum, size) => sum + size, 0);
    const limit = Number(limitRow.data?.storage_limit_bytes ?? 10737418240);
    if (used + data.fileSize > limit) {
      throw new Error("Not enough storage left. Free up space and try again.");
    }
    if (data.checksum) {
      const dupe = (existing.data ?? []).find((r) => r.checksum === data.checksum);
      if (dupe) {
        await supabase.storage.from(MEDIA_BUCKET).remove([data.storagePath]);
        throw new Error(`This file is already in your library as "${dupe.file_name}".`);
      }
    }

    const { data: inserted, error } = await supabase
      .from("media_assets")
      .insert({
        workspace_id: workspaceId,
        uploaded_by: userId,
        folder_id: data.folderId,
        storage_path: data.storagePath,
        file_name: data.fileName,
        media_type: kind,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        width: data.width,
        height: data.height,
        duration_seconds: data.durationSeconds,
        aspect_ratio: data.aspectRatio,
        checksum: data.checksum,
        alt_text: data.altText || null,
        processing_status: "ready",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().uuid().nullable().optional(),
  altText: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const updateMediaAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateInput.parse(data))
  .handler(async ({ data, context }) => {
    const patch: {
      file_name?: string;
      folder_id?: string | null;
      alt_text?: string | null;
      tags?: string[];
    } = {};
    if (data.fileName !== undefined) patch.file_name = data.fileName;
    if (data.folderId !== undefined) patch.folder_id = data.folderId;
    if (data.altText !== undefined) patch.alt_text = data.altText || null;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (Object.keys(patch).length === 0) return { ok: true };
    // RLS confines this to the caller's workspace.
    const { error } = await context.supabase.from("media_assets").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Soft delete (Trash) or restore. */
export const setMediaTrashed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200), trashed: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media_assets")
      .update({ deleted_at: data.trashed ? new Date().toISOString() : null })
      .in("id", data.ids);
    if (error) throw error;
    return { count: data.ids.length };
  });

/** Permanently removes trashed assets and their storage objects. */
export const purgeMediaAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(500).default([]), allTrashed: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const { supabase } = context;

    let query = supabase
      .from("media_assets")
      .select("id, storage_path")
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null);
    if (!data.allTrashed) {
      if (data.ids.length === 0) return { count: 0 };
      query = query.in("id", data.ids);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) return { count: 0 };

    await supabase.storage.from(MEDIA_BUCKET).remove(rows.map((r) => r.storage_path));
    const del = await supabase
      .from("media_assets")
      .delete()
      .in("id", rows.map((r) => r.id));
    if (del.error) throw del.error;
    return { count: rows.length };
  });

export const createMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.string().trim().min(1, "Name the folder").max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const { data: row, error } = await context.supabase
      .from("media_folders")
      .insert({ workspace_id: workspaceId, name: data.name, created_by: context.userId })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" ? "A folder with that name already exists." : error.message,
      );
    }
    return { id: row.id };
  });

export const renameMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media_folders")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Only empty folders can be deleted, so no media is orphaned by accident. */
export const deleteMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { count, error: countError } = await context.supabase
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", data.id)
      .is("deleted_at", null);
    if (countError) throw countError;
    if ((count ?? 0) > 0) throw new Error("Move or delete the media in this folder first.");
    const { error } = await context.supabase.from("media_folders").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Signed preview/download URL for a private object. */
export const getMediaSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media_assets")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Media not found.");
    const signed = await context.supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(row.storage_path, 60 * 10);
    if (signed.error) throw signed.error;
    return { url: signed.data.signedUrl };
  });

/** Trashes every asset that is not referenced by any post. */
export const clearUnusedMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ apply: z.boolean().default(false) }).parse(data))
  .handler(async ({ data, context }) => {
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);
    const { supabase } = context;

    const [assetsRes, usedRes] = await Promise.all([
      supabase
        .from("media_assets")
        .select("id, file_name, file_size, storage_path")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null),
      supabase.from("social_post_media").select("storage_path").eq("workspace_id", workspaceId),
    ]);
    if (assetsRes.error) throw assetsRes.error;
    if (usedRes.error) throw usedRes.error;

    const used = new Set((usedRes.data ?? []).map((r) => r.storage_path));
    const unused = (assetsRes.data ?? []).filter((a) => !used.has(a.storage_path));
    if (data.apply && unused.length > 0) {
      const { error } = await supabase
        .from("media_assets")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", unused.map((a) => a.id));
      if (error) throw error;
    }
    return {
      applied: data.apply,
      items: unused.map((a) => ({ id: a.id, fileName: a.file_name, fileSize: Number(a.file_size) })),
      reclaimedBytes: unused.reduce((s, a) => s + Number(a.file_size ?? 0), 0),
    };
  });
