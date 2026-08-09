// Client-safe helpers for the internal path a user returns to after an OAuth
// round-trip. Only in-app paths are ever allowed, so a crafted state row can
// never bounce a user to an external site.

export const DEFAULT_OAUTH_RETURN_PATH = "/app/accounts";

export function sanitizeReturnPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_OAUTH_RETURN_PATH;
  const raw = value.trim();
  if (!raw.startsWith("/app/")) return DEFAULT_OAUTH_RETURN_PATH;
  // Reject protocol-relative and any attempt to escape the app namespace.
  if (raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) {
    return DEFAULT_OAUTH_RETURN_PATH;
  }
  return raw.slice(0, 500);
}

/** Adds oauth result params to a sanitized internal return path. */
export function returnPathWithResult(
  path: string,
  params: Record<string, string>,
): string {
  const safe = sanitizeReturnPath(path);
  const [pathname, existing] = safe.split("?");
  const search = new URLSearchParams(existing ?? "");
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  return `${pathname}?${search.toString()}`;
}
