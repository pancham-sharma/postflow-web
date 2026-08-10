// TokenManager: the only place provider tokens are decrypted, refreshed and
// re-encrypted. Tokens never leave the server and are never returned to the UI.
import type { SocialPlatform } from "@/lib/social-platforms";
import { encryptToken, decryptToken } from "@/lib/token-crypto.server";
import { classifyProviderError, safeReason } from "@/lib/provider-error-map";
import { tokenExpiryIso } from "@/lib/token-expiry.server";

export type RefreshOutcome =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; reconnectRequired: boolean; code: string; message: string };

/** Never refresh later than this before expiry, whatever the platform config says. */
const MIN_REFRESH_WINDOW_MS = 10 * 60 * 1000;
/** A refresh lock older than this is considered abandoned. */
const LOCK_STALE_MS = 60_000;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const CONNECTION_FIELDS =
  "id, user_id, workspace_id, platform, account_id, account_name, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, connection_status, refresh_failure_count, last_refresh_at";

type ConnectionRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  platform: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  connection_status: string;
  refresh_failure_count: number | null;
  last_refresh_at: string | null;
};

async function readConnection(connectionId: string): Promise<ConnectionRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("social_connections")
    .select(CONNECTION_FIELDS)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConnectionRow | null) ?? null;
}

async function refreshThresholdMs(platform: SocialPlatform): Promise<number> {
  const supabase = await db();
  const { data } = await supabase
    .from("platform_capabilities")
    .select("token_refresh_threshold_minutes")
    .eq("platform", platform)
    .maybeSingle();
  const configured = (data?.token_refresh_threshold_minutes ?? 0) * 60 * 1000;
  return Math.max(configured, MIN_REFRESH_WINDOW_MS);
}

/**
 * Distributed lock. Flips the row to `refreshing` only when nobody else holds
 * it, so two publishing jobs cannot rotate the same refresh token at once.
 */
async function acquireLock(row: ConnectionRow): Promise<boolean> {
  const supabase = await db();
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  let query = supabase
    .from("social_connections")
    .update({ connection_status: "refreshing", last_refresh_at: new Date().toISOString() })
    .eq("id", row.id);
  query =
    row.connection_status === "refreshing"
      ? query.lt("last_refresh_at", staleBefore)
      : query.neq("connection_status", "refreshing");
  const { data } = await query.select("id").maybeSingle();
  return Boolean(data);
}

async function releaseLock(connectionId: string, status: string) {
  const supabase = await db();
  await supabase.from("social_connections").update({ connection_status: status }).eq("id", connectionId);
}

function tokenExpiresAt(expiresInSeconds: number | null): string {
  return tokenExpiryIso(expiresInSeconds);
}

/** Refresh failures that can never succeed again without a fresh authorization. */
function isPermanentRefreshFailure(message: string): boolean {
  const classified = classifyProviderError({ message });
  return (
    classified.requiresReconnect ||
    /invalid_grant|invalid_client|revok|no refresh token|reconnect|unauthorized_client|consent/i.test(message)
  );
}

async function markReconnectRequired(row: ConnectionRow, code: string, message: string) {
  const supabase = await db();
  await supabase
    .from("social_connections")
    .update({
      connection_status: "reconnect_required",
      publishing_eligible: false,
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: message.slice(0, 300),
    })
    .eq("id", row.id);
  await supabase.from("notifications").insert({
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    type: "token_refresh_failed",
    title: "Account needs reconnecting",
    message: `Publishing to your ${row.platform} account is paused until you reconnect it.`,
    social_account_id: row.id,
  });
  await supabase.from("admin_audit_logs").insert({
    action: "token_refresh_permanent_failure",
    target_type: "social_connection",
    target_id: row.id,
    details: { platform: row.platform, code } as never,
  });
}

/**
 * Returns a valid access token for backend publishing code only.
 * Refreshes when the token is inside the refresh window (or when forced after a
 * provider auth rejection), under a lock, atomically storing the new token set.
 */
export async function getValidAccessToken(
  connectionId: string,
  options: { force?: boolean } = {},
): Promise<RefreshOutcome> {
  const supabase = await db();
  const row = await readConnection(connectionId);
  if (!row) {
    return { ok: false, reconnectRequired: true, code: "account_disconnected", message: "This account needs to be reconnected." };
  }
  if (row.connection_status === "disconnected" || row.connection_status === "revoked") {
    return { ok: false, reconnectRequired: true, code: "account_disconnected", message: "This account needs to be reconnected." };
  }
  if (row.connection_status === "reconnect_required" && !options.force) {
    return { ok: false, reconnectRequired: true, code: "token_expired", message: "This account needs to be reconnected." };
  }

  const platform = row.platform as SocialPlatform;
  const accessToken = decryptToken(row.access_token_ciphertext);
  const refreshToken = row.refresh_token_ciphertext ? decryptToken(row.refresh_token_ciphertext) : null;

  const thresholdMs = await refreshThresholdMs(platform);
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
  const nearExpiry = expiresAt !== null && expiresAt - Date.now() <= thresholdMs;
  if (!options.force && !nearExpiry) return { ok: true, accessToken, refreshed: false };

  const previousStatus = row.connection_status === "refreshing" ? "connected" : row.connection_status;
  const locked = await acquireLock(row);
  if (!locked) {
    // Another job is refreshing right now — wait briefly and reuse its result.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const latest = await readConnection(connectionId);
    if (latest && latest.connection_status !== "reconnect_required") {
      return { ok: true, accessToken: decryptToken(latest.access_token_ciphertext), refreshed: true };
    }
    return { ok: false, reconnectRequired: true, code: "token_expired", message: "This account needs to be reconnected." };
  }

  try {
    const { refreshTokens } = await import("@/lib/social-oauth.server");
    const tokens = await refreshTokens(platform, refreshToken, accessToken);

    // Atomic write: access token, rotated refresh token and expiry together.
    const { error: writeError } = await supabase
      .from("social_connections")
      .update({
        access_token_ciphertext: encryptToken(tokens.accessToken),
        // Google does not resend a refresh token; never overwrite it with null.
        // Pinterest rotates it; always store the newest value when present.
        ...(tokens.refreshToken ? { refresh_token_ciphertext: encryptToken(tokens.refreshToken) } : {}),
        token_expires_at: tokenExpiresAt(tokens.expiresInSeconds),
        scopes: tokens.scopes,
        connection_status: "connected",
        publishing_eligible: true,
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: null,
        refresh_failure_count: 0,
      })
      .eq("id", connectionId);
    if (writeError) {
      // Roll back the lock; the old token is still the source of truth.
      await releaseLock(connectionId, previousStatus);
      throw writeError;
    }

    await supabase.from("admin_audit_logs").insert({
      action: "token_refreshed",
      target_type: "social_connection",
      target_id: connectionId,
      details: { platform, rotated_refresh_token: Boolean(tokens.refreshToken) } as never,
    });
    return { ok: true, accessToken: tokens.accessToken, refreshed: true };
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : "Token refresh failed.";
    const message = safeReason(raw, "The authorization could not be renewed.");
    const permanent = isPermanentRefreshFailure(raw) || !refreshToken;

    if (permanent) {
      await markReconnectRequired(row, "token_refresh_failed", message);
      return {
        ok: false,
        reconnectRequired: true,
        code: "token_refresh_failed",
        message: `Your ${platform} authorization was revoked or expired. Reconnect the account.`,
      };
    }

    const failures = (row.refresh_failure_count ?? 0) + 1;
    await supabase
      .from("social_connections")
      .update({
        connection_status: previousStatus === "refreshing" ? "connected" : previousStatus,
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: message.slice(0, 300),
        refresh_failure_count: failures,
      })
      .eq("id", connectionId);
    return {
      ok: false,
      reconnectRequired: false,
      code: "token_refresh_temporarily_failed",
      message: "Could not renew access right now.",
    };
  }
}

/** Backwards-compatible alias used by the publishing engine and health checks. */
export const ensureFreshToken = getValidAccessToken;

export type ConnectionHealth = {
  connectionId: string;
  platform: SocialPlatform;
  status: string;
  tokenDecrypts: boolean;
  accessTokenExpiresAt: string | null;
  hasRefreshToken: boolean;
  lastRefreshAt: string | null;
  scopes: string[];
  missingScopes: string[];
  publishingCapable: boolean;
  ok: boolean;
  reason: string;
};

/**
 * Non-publishing health probe: verifies the stored token decrypts, can be
 * renewed and still carries the scopes this platform needs to publish.
 */
export async function checkConnectionHealth(connectionId: string): Promise<ConnectionHealth> {
  const row = await readConnection(connectionId);
  if (!row) throw new Error("Connection not found");
  const platform = row.platform as SocialPlatform;

  let tokenDecrypts = true;
  try {
    decryptToken(row.access_token_ciphertext);
  } catch {
    tokenDecrypts = false;
  }

  const supabase = await db();
  const { data: capability } = await supabase
    .from("platform_capabilities")
    .select("required_scopes, publishing_enabled, maintenance_mode")
    .eq("platform", platform)
    .maybeSingle();

  const scopes = row.scopes ?? [];
  const required = capability?.required_scopes ?? [];
  const missingScopes = required.filter((scope: string) => !scopes.includes(scope));

  let ok = tokenDecrypts && missingScopes.length === 0;
  let reason = "Connection is healthy.";
  if (!tokenDecrypts) reason = "The stored token could not be decrypted. Reconnect this account.";
  else if (missingScopes.length > 0) reason = "A required publishing permission is missing. Reconnect and grant access.";

  if (ok) {
    const token = await getValidAccessToken(connectionId);
    if (!token.ok) {
      ok = false;
      reason = token.message;
    } else {
      reason = token.refreshed ? "Authorization renewed successfully." : "Access token is valid.";
    }
  }

  return {
    connectionId,
    platform,
    status: row.connection_status,
    tokenDecrypts,
    accessTokenExpiresAt: row.token_expires_at,
    hasRefreshToken: Boolean(row.refresh_token_ciphertext),
    lastRefreshAt: row.last_refresh_at,
    scopes,
    missingScopes,
    publishingCapable: Boolean(capability?.publishing_enabled) && !capability?.maintenance_mode,
    ok,
    reason,
  };
}
