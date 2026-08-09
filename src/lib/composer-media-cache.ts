// Keeps the composer's selected file alive while the user visits another page.
// Files can't go in sessionStorage, so this in-memory cache survives route
// changes (but not a full page reload, by design).
export type ComposerMediaMeta = {
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type ComposerMedia = {
  file: File;
  previewUrl: string;
  meta: ComposerMediaMeta;
};

// Kept on globalThis so it survives module re-evaluation (dev HMR, split chunks).
const KEY = "__postflowComposerMedia";
type Holder = { [KEY]?: ComposerMedia | null };

function holder(): Holder {
  return globalThis as unknown as Holder;
}

export function getComposerMedia(): ComposerMedia | null {
  return holder()[KEY] ?? null;
}

export function setComposerMedia(media: ComposerMedia | null) {
  const current = getComposerMedia();
  if (current && current !== media && (!media || current.previewUrl !== media.previewUrl)) {
    URL.revokeObjectURL(current.previewUrl);
  }
  holder()[KEY] = media;
}

export function updateComposerMediaMeta(meta: ComposerMediaMeta) {
  const current = getComposerMedia();
  if (current) holder()[KEY] = { ...current, meta };
}
