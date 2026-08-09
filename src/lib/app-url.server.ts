// Server-only. The canonical, browser-visible base URL of this PostFlow
// deployment. Provider redirect URIs must be byte-identical to what the owner
// registered in the provider dashboard, so they are derived ONLY from the
// POSTFLOW_APP_URL secret — never from window.location, Origin/Referer headers,
// the Lovable editor URL or any other client-controlled input.

const PLACEHOLDERS = new Set([
  "",
  "demo",
  "test",
  "123456",
  "changeme",
  "todo",
  "placeholder",
  "your-app-id",
  "your-app-secret",
  "your_app_id",
  "your_app_secret",
  "http://localhost",
  "https://example.com",
]);

export class AppUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlConfigurationError";
  }
}

function clean(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDERS.has(value.toLowerCase());
}

/** Reads POSTFLOW_APP_URL and validates it as an absolute https app origin. */
export function postflowAppUrl(): string {
  const raw = clean(process.env["POSTFLOW_APP_URL"]);
  if (!raw || isPlaceholderSecret(raw)) {
    throw new AppUrlConfigurationError(
      "POSTFLOW_APP_URL is not configured. Add the published PostFlow URL to backend secrets.",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppUrlConfigurationError("POSTFLOW_APP_URL is not a valid absolute URL.");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new AppUrlConfigurationError("POSTFLOW_APP_URL must use https.");
  }
  return url.origin;
}

/** POSTFLOW_APP_URL without throwing — for status/diagnostic responses. */
export function postflowAppUrlOrNull(): string | null {
  try {
    return postflowAppUrl();
  } catch {
    return null;
  }
}

/**
 * Per-platform redirect URI override, e.g. SNAPCHAT_REDIRECT_URI. When set it
 * wins over POSTFLOW_APP_URL so the value is byte-identical to what the owner
 * registered in the provider dashboard.
 */
export function providerRedirectUriOverride(platform: string): string | null {
  const raw = clean(process.env[`${platform.toUpperCase()}_REDIRECT_URI`]);
  if (!raw || isPlaceholderSecret(raw)) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

/** The exact callback the owner must register with the provider. */
export function providerCallbackUrl(platform: string, appUrl?: string): string {
  const override = providerRedirectUriOverride(platform);
  if (override) return override;
  return new URL(
    `/api/public/oauth/callback/${platform}`,
    appUrl ?? postflowAppUrl(),
  ).toString();
}
