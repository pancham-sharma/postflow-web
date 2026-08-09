import type { PostDetailValues } from "@/components/composer/post-details";
import type { PlatformContent } from "@/lib/platform-content";

export type ComposerDraft = {
  details: PostDetailValues;
  selectedAccountIds: string[] | null;
  platformContents?: Record<string, PlatformContent>;
  savedAt: number;
};

const PREFIX = "postflow:create-post:";
const RETURN_KEY = "postflow:composer-return";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

/** Only text fields and IDs are persisted — never files, tokens or signed URLs. */
export function saveComposerDraft(userId: string, draft: Omit<ComposerDraft, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      key(userId),
      JSON.stringify({ ...draft, savedAt: Date.now() } satisfies ComposerDraft),
    );
  } catch {
    // Storage unavailable (private mode / quota) — the composer keeps working.
  }
}

export function loadComposerDraft(userId: string): ComposerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.details) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearComposerDraft(userId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

/** Drops every composer draft — used on sign-out. */
export function clearAllComposerDrafts() {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** Accepts only internal PostFlow paths; anything else falls back. */
export function sanitizeInternalReturnPath(
  value: string | null | undefined,
  fallback = "/app/accounts",
): string {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/app/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.includes("://") || /[\u0000-\u001f]/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export function rememberComposerReturn(path: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RETURN_KEY, sanitizeInternalReturnPath(path, "/app/create"));
  } catch {
    /* ignore */
  }
}

export function takeComposerReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    if (value) sessionStorage.removeItem(RETURN_KEY);
    return value ? sanitizeInternalReturnPath(value, "/app/create") : null;
  } catch {
    return null;
  }
}
