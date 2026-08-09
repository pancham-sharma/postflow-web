// Resolves the browser-visible origin of the app. Inside the Lovable preview
// (and behind any proxy) `request.url` is the internal host (localhost:8080),
// which OAuth providers reject as a redirect_uri. Prefer forwarded headers, and
// accept a client-supplied origin only when it is on a trusted host.

const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];

export function isTrustedOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

function fromHeaders(request: Request): string | null {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? null;
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return null;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const candidate = `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
  return isTrustedOrigin(candidate) ? candidate : null;
}

function fromReferer(request: Request): string | null {
  for (const header of ["origin", "referer"] as const) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    try {
      const origin = new URL(raw).origin;
      if (isTrustedOrigin(origin) && !origin.includes("localhost")) return origin;
    } catch {
      /* ignore malformed header */
    }
  }
  return null;
}

/** Best-effort public origin, optionally seeded by a client-reported origin. */
export function resolvePublicOrigin(request: Request, clientOrigin?: string | null): string {
  const client = clientOrigin && isTrustedOrigin(clientOrigin) ? clientOrigin : null;
  if (client && !client.includes("localhost")) return client;
  return fromHeaders(request) ?? fromReferer(request) ?? client ?? new URL(request.url).origin;
}

export function callbackUrl(origin: string, platform: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/oauth/callback/${platform}`;
}
