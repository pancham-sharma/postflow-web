// Client-safe media library types and helpers.
export const MEDIA_BUCKET = "post-media";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"] as const;

export type MediaKind = "image" | "video";

export type MediaFolder = {
  id: string;
  name: string;
  assetCount: number;
  createdAt: string;
};

export type MediaAsset = {
  id: string;
  folderId: string | null;
  fileName: string;
  mediaType: MediaKind;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  altText: string | null;
  tags: string[];
  processingStatus: string;
  storagePath: string;
  createdAt: string;
  deletedAt: string | null;
  usedIn: number;
};

export type StorageUsage = {
  limitBytes: number;
  usedBytes: number;
  imageBytes: number;
  videoBytes: number;
  otherBytes: number;
  trashBytes: number;
  fileCount: number;
};

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Reduces a width/height pair to a readable ratio label such as 9:16. */
export function aspectLabel(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height) || 1;
  const w = Math.round(width / d);
  const h = Math.round(height / d);
  // Very large reduced pairs are meaningless to a user, so fall back to a decimal.
  if (w > 32 || h > 32) return `${(width / height).toFixed(2)}:1`;
  return `${w}:${h}`;
}

export function kindFromMime(mime: string): MediaKind | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) return "image";
  if ((ALLOWED_VIDEO_MIME as readonly string[]).includes(mime)) return "video";
  return null;
}

/** Extension + MIME validation, matching the server-side check. */
export function validateFile(file: File): { kind: MediaKind } | { error: string } {
  const kind = kindFromMime(file.type);
  if (!kind) return { error: `${file.name}: unsupported file type (${file.type || "unknown"}).` };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt =
    kind === "image" ? ["jpg", "jpeg", "png", "webp", "gif"] : ["mp4", "mov", "webm"];
  if (!allowedExt.includes(ext)) {
    return { error: `${file.name}: extension .${ext} does not match its content type.` };
  }
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > max) {
    return { error: `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(max)}.` };
  }
  return { kind };
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "upload";
}

/** Reads intrinsic dimensions/duration in the browser so the record is accurate. */
export async function probeMedia(
  file: File,
  kind: MediaKind,
): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not read this image."));
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight, duration: null };
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read this video."));
      video.src = url;
    });
    return {
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
    };
  } catch {
    return { width: null, height: null, duration: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SHA-256 of the file contents, used to detect duplicate uploads. */
export async function fileChecksum(file: File): Promise<string | null> {
  try {
    if (!crypto?.subtle || file.size > 64 * 1024 * 1024) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
