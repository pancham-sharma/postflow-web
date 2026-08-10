import { MEDIA_BUCKET } from "@/lib/media-library";

export { MEDIA_BUCKET };

// Media access for provider ingestion: short-lived signed URLs only.

/** Providers pull assets over HTTPS, so we hand them a time-limited signed URL. */
export async function signedMediaUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("[publish] could not sign media url", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/;

export function classifyMedia(mimeType: string | null): "image" | "video" | "none" {
  if (!mimeType) return "none";
  if (IMAGE_MIME.test(mimeType)) return "image";
  if (VIDEO_MIME.test(mimeType)) return "video";
  return "none";
}

export function isAllowedMimeType(mimeType: string): boolean {
  return IMAGE_MIME.test(mimeType) || VIDEO_MIME.test(mimeType);
}

/** Rejects path traversal and non-workspace-owned upload paths. */
export function isSafeStoragePath(path: string, userId: string): boolean {
  if (path.includes("..") || path.startsWith("/")) return false;
  return path.startsWith(`users/${userId}/`) || path.startsWith(`${userId}/`);
}

/**
 * Reads an object's size/mime straight from storage. Used to prove a source
 * upload still exists before any processing, and to validate that a rendered
 * output is a real, non-empty file before it is sent to a platform.
 */
export async function statMediaObject(
  path: string,
  bucket: string = MEDIA_BUCKET,
): Promise<{ size: number; mimeType: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const file = slash === -1 ? path : path.slice(slash + 1);
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(dir, { search: file, limit: 100 });
  if (error) {
    console.error("[media] could not stat object", { bucket, error: error.message });
    return null;
  }
  const match = (data ?? []).find((entry) => entry.name === file);
  if (!match) return null;
  const metadata = (match.metadata ?? {}) as Record<string, unknown>;
  return {
    size: Number(metadata["size"] ?? 0),
    mimeType: typeof metadata["mimetype"] === "string" ? (metadata["mimetype"] as string) : null,
  };
}
