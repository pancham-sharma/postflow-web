// Snapchat Public Profile API (automatic publishing) — server only.
//
// This integration is deliberately SEPARATE from the existing Snapchat Login
// Kit / Creative Kit connection: it has its own OAuth client, its own scope
// (snapchat-profile-api), its own encrypted tokens and its own table
// (public.snapchat_public_profile_connections).
//
// Capability is NEVER assumed. `verifyCapability()` calls the live Snapchat
// Public Profile API with the user's own token; 401/403/404 answers mark the
// capability unavailable and PostFlow keeps using the Creative Kit
// "Ready to share" flow. Nothing is ever reported as Published unless
// Snapchat confirmed the content creation.
//
// Endpoint paths and the API base come from Snapchat's Business API
// (Public Profile content management). They are centralised here and can be
// re-pointed with SNAPCHAT_PP_API_BASE without touching call sites.
import { encryptToken, decryptToken } from "./token-crypto.server";
import {
  validateSnapchatMedia,
  type SnapchatDestination,
  type SnapchatMediaFacts,
} from "./snapchat-media-validation";
import type { SnapchatErrorCode } from "./snapchat-errors";

export const SNAPCHAT_PP_AUTHORIZE_URL = "https://accounts.snapchat.com/login/oauth2/authorize";
export const SNAPCHAT_PP_TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token";
export const SNAPCHAT_PP_SCOPES = ["snapchat-profile-api"];
export const SNAPCHAT_PP_RETURN_PATH = "/app/accounts";

function env(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

export function apiBase(): string {
  return env("SNAPCHAT_PP_API_BASE") || "https://businessapi.snapchat.com/v1";
}

export type ConfigCheck = { configured: boolean; missing: string[] };

/** Server-side configuration validation. Missing config disables automation. */
export function checkConfiguration(): ConfigCheck {
  const missing = [
    "SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID",
    "SNAPCHAT_PUBLIC_PROFILE_CLIENT_SECRET",
  ].filter((name) => !env(name));
  return { configured: missing.length === 0, missing };
}

export function credentials() {
  const check = checkConfiguration();
  if (!check.configured) {
    throw new SnapchatApiError(
      "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE",
      "Automatic Snapchat publishing is not configured.",
      { retryable: false },
    );
  }
  return {
    clientId: env("SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID"),
    clientSecret: env("SNAPCHAT_PUBLIC_PROFILE_CLIENT_SECRET"),
  };
}

export function redirectUri(fallbackOrigin: string | null): string {
  const override = env("SNAPCHAT_PUBLIC_PROFILE_REDIRECT_URI");
  const origin = env("POSTFLOW_APP_URL") || fallbackOrigin || "";
  if (override && override.includes("snapchat-public-profile")) return override;
  if (!origin) throw new Error("No public app URL is available for the Snapchat redirect URI.");
  return `${origin.replace(/\/$/, "")}/api/public/oauth/snapchat-public-profile/callback`;
}

export class SnapchatApiError extends Error {
  code: SnapchatErrorCode;
  retryable: boolean;
  retryAfterSeconds: number | null;
  constructor(
    code: SnapchatErrorCode,
    message: string,
    opts: { retryable?: boolean; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = "SnapchatApiError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ------------------------------------------------------------- connection

export type PublicProfileConnection = {
  id: string;
  userId: string;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
  publicProfileId: string | null;
  publicProfileName: string | null;
  availableProfiles: { id: string; name: string }[];
  apiAvailable: boolean;
  capabilities: Record<string, unknown>;
  connectionStatus: "connected" | "reconnect_required" | "api_unavailable" | "disconnected";
  lastErrorCode: string | null;
  lastVerifiedAt: string | null;
  connectedAt: string;
};

function toConnection(row: any): PublicProfileConnection {
  return {
    id: row.id,
    userId: row.user_id,
    tokenExpiresAt: row.token_expires_at,
    grantedScopes: row.granted_scopes ?? [],
    publicProfileId: row.public_profile_id,
    publicProfileName: row.public_profile_name,
    availableProfiles: Array.isArray(row.available_profiles) ? row.available_profiles : [],
    apiAvailable: Boolean(row.public_profile_api_available),
    capabilities: (row.capabilities ?? {}) as Record<string, unknown>,
    connectionStatus: row.connection_status,
    lastErrorCode: row.last_error_code,
    lastVerifiedAt: row.last_verified_at,
    connectedAt: row.connected_at,
  };
}

export async function getConnection(userId: string): Promise<PublicProfileConnection | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("snapchat_public_profile_connections")
    .select(
      "id, user_id, token_expires_at, granted_scopes, public_profile_id, public_profile_name, available_profiles, public_profile_api_available, capabilities, connection_status, last_error_code, last_verified_at, connected_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toConnection(data) : null;
}

async function readTokens(userId: string) {
  const supabase = await db();
  const { data } = await supabase
    .from("snapchat_public_profile_connections")
    .select("id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, connection_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token_ciphertext) return null;
  return {
    id: data.id as string,
    accessToken: decryptToken(data.access_token_ciphertext),
    refreshToken: data.refresh_token_ciphertext ? decryptToken(data.refresh_token_ciphertext) : null,
    expiresAt: data.token_expires_at as string | null,
    status: data.connection_status as string,
  };
}

async function patchConnection(userId: string, patch: Record<string, unknown>) {
  const supabase = await db();
  await supabase
    .from("snapchat_public_profile_connections")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId);
}

export async function disconnect(userId: string) {
  const supabase = await db();
  await supabase.from("snapchat_public_profile_connections").delete().eq("user_id", userId);
}

// ------------------------------------------------------------------ OAuth

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
  scopes: string[];
};

async function tokenRequest(body: URLSearchParams): Promise<TokenSet | null> {
  const response = await fetch(SNAPCHAT_PP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || !payload["access_token"]) return null;
  return {
    accessToken: String(payload["access_token"]),
    refreshToken: payload["refresh_token"] ? String(payload["refresh_token"]) : null,
    expiresInSeconds: Number(payload["expires_in"] ?? 0) || null,
    scopes: String(payload["scope"] ?? SNAPCHAT_PP_SCOPES.join(" "))
      .split(/[\s,]+/)
      .filter(Boolean),
  };
}

export async function exchangeCode(
  code: string,
  redirect: string,
  codeVerifier: string | null,
): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);
  const tokens = await tokenRequest(body);
  if (!tokens) {
    console.error("[SNAP_PP_OAUTH_CALLBACK] token exchange rejected");
    throw new SnapchatApiError(
      "SNAPCHAT_PERMISSION_MISSING",
      "Snapchat rejected the Public Profile authorization.",
    );
  }
  return tokens;
}

/** Refreshes the Public-Profile token when it is expired or close to expiry. */
export async function ensureFreshToken(userId: string): Promise<string> {
  const stored = await readTokens(userId);
  if (!stored) {
    throw new SnapchatApiError("SNAPCHAT_RECONNECT_REQUIRED", "Snapchat is not connected for automatic publishing.");
  }
  const expiresAt = stored.expiresAt ? new Date(stored.expiresAt).getTime() : null;
  const stale = expiresAt !== null && expiresAt - Date.now() < 5 * 60 * 1000;
  if (!stale) return stored.accessToken;

  if (!stored.refreshToken) {
    await patchConnection(userId, {
      connection_status: "reconnect_required",
      last_error_code: "SNAPCHAT_TOKEN_EXPIRED",
    });
    throw new SnapchatApiError("SNAPCHAT_TOKEN_EXPIRED", "Your Snapchat connection expired.");
  }

  console.info("[SNAP_PP_TOKEN_REFRESH]", { user_id: userId });
  const { clientId, clientSecret } = credentials();
  const refreshed = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
  if (!refreshed) {
    console.error("[SNAP_PP_TOKEN_REFRESH_FAILED]", { user_id: userId });
    await patchConnection(userId, {
      connection_status: "reconnect_required",
      last_error_code: "SNAPCHAT_TOKEN_REFRESH_FAILED",
    });
    throw new SnapchatApiError("SNAPCHAT_TOKEN_REFRESH_FAILED", "Your Snapchat connection expired.");
  }
  await patchConnection(userId, {
    access_token_ciphertext: encryptToken(refreshed.accessToken),
    ...(refreshed.refreshToken
      ? { refresh_token_ciphertext: encryptToken(refreshed.refreshToken) }
      : {}),
    token_expires_at: refreshed.expiresInSeconds
      ? new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString()
      : null,
    connection_status: "connected",
    last_error_code: null,
  });
  return refreshed.accessToken;
}

export async function storeConnection(args: {
  userId: string;
  workspaceId: string | null;
  tokens: TokenSet;
}) {
  const supabase = await db();
  const now = new Date().toISOString();
  const { error } = await supabase.from("snapchat_public_profile_connections").upsert(
    {
      user_id: args.userId,
      workspace_id: args.workspaceId,
      provider: "snapchat_public_profile",
      access_token_ciphertext: encryptToken(args.tokens.accessToken),
      refresh_token_ciphertext: args.tokens.refreshToken
        ? encryptToken(args.tokens.refreshToken)
        : null,
      token_expires_at: args.tokens.expiresInSeconds
        ? new Date(Date.now() + args.tokens.expiresInSeconds * 1000).toISOString()
        : null,
      granted_scopes: args.tokens.scopes,
      connection_status: "connected",
      last_error_code: null,
      connected_at: now,
      updated_at: now,
    } as never,
    { onConflict: "user_id" },
  );
  if (error) throw error;
  console.info("[SNAP_PP_OAUTH_SUCCESS]", { user_id: args.userId });
}

// ------------------------------------------------- capability + discovery

export type CapabilityReport = {
  available: boolean;
  reason: string;
  profiles: { id: string; name: string }[];
  selectedProfileId: string | null;
  destinations: SnapchatDestination[];
};

async function apiFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, any>; retryAfter: number | null }> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  const retryAfterHeader = response.headers.get("retry-after");
  return {
    status: response.status,
    body,
    retryAfter: retryAfterHeader ? Number(retryAfterHeader) || null : null,
  };
}

function parseProfiles(body: Record<string, any>): { id: string; name: string }[] {
  const list: any[] = Array.isArray(body["public_profiles"])
    ? body["public_profiles"]
    : Array.isArray(body["data"])
      ? body["data"]
      : [];
  return list
    .map((entry) => {
      const node = entry?.["public_profile"] ?? entry;
      const id = node?.["id"] ?? node?.["public_profile_id"];
      if (!id) return null;
      return { id: String(id), name: String(node?.["display_name"] ?? node?.["name"] ?? "Public Profile") };
    })
    .filter(Boolean) as { id: string; name: string }[];
}

function destinationsFrom(body: Record<string, any>): SnapchatDestination[] {
  // Only expose surfaces Snapchat actually reports for this profile. When the
  // API does not report capabilities we fall back to Public Story only —
  // never assume Spotlight access.
  const raw = body["capabilities"] ?? body["supported_surfaces"] ?? null;
  const values: string[] = Array.isArray(raw)
    ? raw.map(String)
    : raw && typeof raw === "object"
      ? Object.keys(raw).filter((key) => Boolean((raw as Record<string, unknown>)[key]))
      : [];
  const normalized = values.map((v) => v.toLowerCase());
  const result: SnapchatDestination[] = [];
  if (normalized.some((v) => v.includes("story"))) result.push("public_story");
  if (normalized.some((v) => v.includes("spotlight"))) result.push("spotlight");
  return result.length > 0 ? result : ["public_story"];
}

/** Live verification against Snapchat. Never trusts an environment flag. */
export async function verifyCapability(userId: string): Promise<CapabilityReport> {
  const empty = (reason: string): CapabilityReport => ({
    available: false,
    reason,
    profiles: [],
    selectedProfileId: null,
    destinations: [],
  });

  if (!checkConfiguration().configured) return empty("not_configured");
  const existing = await getConnection(userId);
  if (!existing) return empty("not_connected");

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (error) {
    const code = error instanceof SnapchatApiError ? error.code : "SNAPCHAT_RECONNECT_REQUIRED";
    await patchConnection(userId, {
      public_profile_api_available: false,
      connection_status: "reconnect_required",
      last_error_code: code,
      last_verified_at: new Date().toISOString(),
    });
    return empty(code);
  }

  console.info("[SNAP_PP_CAPABILITY_CHECK]", { user_id: userId });
  console.info("[SNAP_PP_PROFILE_LOOKUP]", { user_id: userId });
  let result;
  try {
    result = await apiFetch(accessToken, "/me/public_profiles");
  } catch {
    return empty("network_error");
  }

  if (result.status === 401 || result.status === 403 || result.status === 404) {
    const reason =
      result.status === 401
        ? "SNAPCHAT_TOKEN_EXPIRED"
        : "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE";
    console.info("[SNAP_PP_CAPABILITY_UNAVAILABLE]", { user_id: userId, status: result.status });
    await patchConnection(userId, {
      public_profile_api_available: false,
      connection_status: result.status === 401 ? "reconnect_required" : "api_unavailable",
      last_error_code: reason,
      last_verified_at: new Date().toISOString(),
      capabilities: {} as never,
    });
    return empty(reason);
  }
  if (result.status >= 400) {
    await patchConnection(userId, {
      public_profile_api_available: false,
      connection_status: "api_unavailable",
      last_error_code: "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE",
      last_verified_at: new Date().toISOString(),
    });
    return empty(`http_${result.status}`);
  }

  const profiles = parseProfiles(result.body);
  if (profiles.length === 0) {
    console.info("[SNAP_PP_CAPABILITY_UNAVAILABLE]", { user_id: userId, reason: "no_profile" });
    await patchConnection(userId, {
      public_profile_api_available: false,
      connection_status: "api_unavailable",
      last_error_code: "SNAPCHAT_PUBLIC_PROFILE_NOT_FOUND",
      last_verified_at: new Date().toISOString(),
      available_profiles: [] as never,
    });
    return empty("SNAPCHAT_PUBLIC_PROFILE_NOT_FOUND");
  }

  const keep = profiles.find((p) => p.id === existing.publicProfileId);
  const selected = keep ?? (profiles.length === 1 ? profiles[0]! : null);
  const destinations = destinationsFrom(result.body);
  console.info("[SNAP_PP_PROFILE_FOUND]", {
    user_id: userId,
    public_profile_id: selected?.id ?? null,
    profiles: profiles.length,
  });
  console.info("[SNAP_PP_CAPABILITY_AVAILABLE]", { user_id: userId, destinations });

  await patchConnection(userId, {
    public_profile_api_available: true,
    connection_status: "connected",
    last_error_code: null,
    last_verified_at: new Date().toISOString(),
    available_profiles: profiles as never,
    public_profile_id: selected?.id ?? null,
    public_profile_name: selected?.name ?? null,
    capabilities: { destinations } as never,
  });

  return {
    available: true,
    reason: "ok",
    profiles,
    selectedProfileId: selected?.id ?? null,
    destinations,
  };
}

export async function selectProfile(userId: string, profileId: string) {
  const connection = await getConnection(userId);
  if (!connection) throw new SnapchatApiError("SNAPCHAT_RECONNECT_REQUIRED", "Snapchat is not connected.");
  const match = connection.availableProfiles.find((p) => p.id === profileId);
  if (!match) {
    throw new SnapchatApiError("SNAPCHAT_PUBLIC_PROFILE_NOT_FOUND", "That Public Profile is not available.");
  }
  await patchConnection(userId, {
    public_profile_id: match.id,
    public_profile_name: match.name,
  });
}

/** Publishing-time capability resolution used by the worker. */
export async function resolveAutomaticPublishing(userId: string): Promise<
  | { mode: "public_profile_api"; accessToken: string; publicProfileId: string; destinations: SnapchatDestination[] }
  | { mode: "creative_kit"; reason: string }
> {
  if (!checkConfiguration().configured) return { mode: "creative_kit", reason: "not_configured" };
  const connection = await getConnection(userId);
  if (!connection) return { mode: "creative_kit", reason: "not_connected" };

  const stale =
    !connection.lastVerifiedAt ||
    Date.now() - new Date(connection.lastVerifiedAt).getTime() > 15 * 60 * 1000;
  const report = stale || !connection.apiAvailable ? await verifyCapability(userId) : null;
  const available = report ? report.available : connection.apiAvailable;
  const profileId = report ? report.selectedProfileId : connection.publicProfileId;
  const destinations = report
    ? report.destinations
    : ((connection.capabilities["destinations"] as SnapchatDestination[]) ?? ["public_story"]);

  if (!available || !profileId) {
    return { mode: "creative_kit", reason: report?.reason ?? connection.lastErrorCode ?? "unavailable" };
  }
  const accessToken = await ensureFreshToken(userId);
  return { mode: "public_profile_api", accessToken, publicProfileId: profileId, destinations };
}

// -------------------------------------------------------------- publishing

export type MediaUploadResult = { mediaId: string };

function throwForStatus(status: number, retryAfter: number | null, fallback: SnapchatErrorCode): never {
  if (status === 429) {
    throw new SnapchatApiError("SNAPCHAT_RATE_LIMITED", "Snapchat is rate limiting publishing.", {
      retryable: true,
      retryAfterSeconds: retryAfter,
    });
  }
  if (status === 401) {
    throw new SnapchatApiError("SNAPCHAT_TOKEN_EXPIRED", "Your Snapchat connection expired.");
  }
  if (status === 403 || status === 404) {
    throw new SnapchatApiError(
      "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE",
      "Automatic Snapchat publishing is not enabled for this connection.",
    );
  }
  throw new SnapchatApiError(fallback, "Snapchat could not complete this request.", {
    retryable: status >= 500,
  });
}

/**
 * Creates the Snapchat media object for the stored PostFlow video. Snapchat
 * fetches the file from the time-limited signed URL, so the original upload is
 * never re-uploaded from the browser and never buffered in worker memory.
 */
export async function createMedia(args: {
  accessToken: string;
  publicProfileId: string;
  mediaUrl: string;
  fileName: string;
  mimeType: string;
}): Promise<MediaUploadResult> {
  console.info("[SNAP_PP_MEDIA_UPLOAD_START]", { public_profile_id: args.publicProfileId });
  const result = await apiFetch(args.accessToken, `/public_profiles/${args.publicProfileId}/media`, {
    method: "POST",
    body: JSON.stringify({
      media_type: "VIDEO",
      media_url: args.mediaUrl,
      file_name: args.fileName,
      content_type: args.mimeType,
    }),
  });
  if (result.status >= 400) {
    console.error("[SNAP_PP_PUBLISH_FAILED]", { stage: "media_upload", status: result.status });
    throwForStatus(result.status, result.retryAfter, "SNAPCHAT_MEDIA_UPLOAD_FAILED");
  }
  const mediaId = String(result.body["media_id"] ?? result.body["id"] ?? result.body["asset_id"] ?? "");
  if (!mediaId) {
    throw new SnapchatApiError("SNAPCHAT_MEDIA_UPLOAD_FAILED", "Snapchat did not return a media id.", {
      retryable: true,
    });
  }
  console.info("[SNAP_PP_MEDIA_UPLOAD_SUCCESS]", { snapchat_media_id: mediaId });
  return { mediaId };
}

export type MediaProcessingState = "pending" | "processing" | "ready" | "failed";

export async function getMediaState(
  accessToken: string,
  mediaId: string,
): Promise<{ state: MediaProcessingState; retryAfter: number | null }> {
  const result = await apiFetch(accessToken, `/media/${mediaId}`);
  if (result.status === 429) return { state: "processing", retryAfter: result.retryAfter };
  if (result.status >= 400) {
    throwForStatus(result.status, result.retryAfter, "SNAPCHAT_MEDIA_PROCESSING_FAILED");
  }
  const raw = String(result.body["status"] ?? result.body["media"]?.["status"] ?? "").toUpperCase();
  console.info("[SNAP_PP_MEDIA_PROCESSING]", { snapchat_media_id: mediaId, state: raw || "UNKNOWN" });
  if (["READY", "SUCCEEDED", "ACTIVE", "COMPLETE", "COMPLETED"].includes(raw)) {
    return { state: "ready", retryAfter: null };
  }
  if (["FAILED", "ERROR", "REJECTED"].includes(raw)) return { state: "failed", retryAfter: null };
  if (raw === "PENDING") return { state: "pending", retryAfter: result.retryAfter };
  return { state: "processing", retryAfter: result.retryAfter };
}

/** Bounded polling: never hammers Snapchat, never blocks a worker forever. */
export async function waitForMedia(
  accessToken: string,
  mediaId: string,
  opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 4 * 60 * 1000;
  const baseInterval = opts.intervalMs ?? 5000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    const { state, retryAfter } = await getMediaState(accessToken, mediaId);
    if (state === "ready") return;
    if (state === "failed") {
      throw new SnapchatApiError("SNAPCHAT_MEDIA_PROCESSING_FAILED", "Snapchat could not process this video.");
    }
    attempt += 1;
    const wait = retryAfter ? retryAfter * 1000 : Math.min(baseInterval * attempt, 20000);
    await sleep(wait);
  }
  throw new SnapchatApiError(
    "SNAPCHAT_MEDIA_PROCESSING_TIMEOUT",
    "Snapchat is still processing this video.",
    { retryable: true },
  );
}

export type ContentCreation = {
  contentId: string;
  confirmed: boolean;
  url: string | null;
};

/** Creates the Public Story / Spotlight post from processed media. */
export async function createContent(args: {
  accessToken: string;
  publicProfileId: string;
  mediaId: string;
  destination: SnapchatDestination;
  caption: string;
  idempotencyKey: string;
}): Promise<ContentCreation> {
  console.info("[SNAP_PP_CONTENT_CREATE]", {
    public_profile_id: args.publicProfileId,
    destination: args.destination,
    snapchat_media_id: args.mediaId,
  });
  const path =
    args.destination === "spotlight"
      ? `/public_profiles/${args.publicProfileId}/spotlights`
      : `/public_profiles/${args.publicProfileId}/stories`;
  const result = await apiFetch(args.accessToken, path, {
    method: "POST",
    headers: { "X-Idempotency-Key": args.idempotencyKey },
    body: JSON.stringify({
      media_id: args.mediaId,
      caption: args.caption,
      idempotency_key: args.idempotencyKey,
    }),
  });
  if (result.status >= 400) {
    console.error("[SNAP_PP_PUBLISH_FAILED]", { stage: "content_create", status: result.status });
    throwForStatus(result.status, result.retryAfter, "SNAPCHAT_CONTENT_CREATE_FAILED");
  }
  const contentId = String(result.body["id"] ?? result.body["content_id"] ?? "");
  if (!contentId) {
    throw new SnapchatApiError("SNAPCHAT_CONTENT_CREATE_FAILED", "Snapchat did not confirm this post.", {
      retryable: true,
    });
  }
  const status = String(result.body["status"] ?? "").toUpperCase();
  const confirmed = ["PUBLISHED", "LIVE", "ACTIVE", "SUCCEEDED", ""].includes(status);
  return {
    contentId,
    confirmed,
    url: typeof result.body["url"] === "string" ? result.body["url"] : null,
  };
}

/** Publication confirmation — the only thing allowed to produce "published". */
export async function getContentStatus(
  accessToken: string,
  contentId: string,
): Promise<{ status: "published" | "processing" | "failed"; url: string | null }> {
  const result = await apiFetch(accessToken, `/content/${contentId}`);
  if (result.status >= 400) return { status: "processing", url: null };
  const raw = String(result.body["status"] ?? result.body["content"]?.["status"] ?? "").toUpperCase();
  const url = typeof result.body["url"] === "string" ? result.body["url"] : null;
  if (["PUBLISHED", "LIVE", "ACTIVE", "SUCCEEDED"].includes(raw)) return { status: "published", url };
  if (["FAILED", "REJECTED", "ERROR"].includes(raw)) return { status: "failed", url };
  return { status: "processing", url };
}

/** Re-exported so the adapter validates through the single shared service. */
export function validateMedia(destination: SnapchatDestination, media: SnapchatMediaFacts) {
  const outcome = validateSnapchatMedia(destination, media);
  console.info("[SNAP_PP_MEDIA_VALIDATION]", { destination, ok: outcome.ok, issues: outcome.issues.length });
  return outcome;
}
