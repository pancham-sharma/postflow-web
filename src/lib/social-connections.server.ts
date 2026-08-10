// Server-only data access for linked social accounts. Uses the service-role
// client because the tables are private: tokens never leave the server.
import { connectionStatus, type SocialConnection, type SocialPlatform } from "./social-platforms";
import { createHash } from "node:crypto";
import { decryptToken, encryptToken } from "./token-crypto.server";
import { providers } from "./social-oauth.server";
import { tokenExpiryIso } from "./token-expiry.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function logSupabaseOAuthError(args: {
  operation: string;
  table: string;
  provider: SocialPlatform;
  userId?: string | null;
  workspaceId?: string | null;
  error: { code?: string; message?: string; details?: string; hint?: string };
}) {
  console.error("[OAUTH_SUPABASE_OPERATION_FAILED]", {
    operation: args.operation,
    table: args.table,
    provider: args.provider,
    userIdPresent: Boolean(args.userId),
    workspaceIdPresent: Boolean(args.workspaceId),
    errorCode: args.error.code ?? "unknown",
    errorMessage: args.error.message ?? "unknown",
    errorDetails: args.error.details ?? null,
    errorHint: args.error.hint ?? null,
  });
}

function toConnection(row: any): SocialConnection {
  return {
    id: row.id,
    platform: row.platform as SocialPlatform,
    accountId: row.account_id,
    accountName: row.account_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    scopes: row.scopes ?? [],
    tokenExpiresAt: row.token_expires_at,
    lastSyncAt: row.last_sync_at,
    connectedAt: row.created_at ?? row.last_sync_at,
    status: connectionStatus(row.token_expires_at),
    canRefresh: providers[row.platform as SocialPlatform]?.supportsRefresh ?? false,
  };
}

/** Resolves the caller's active workspace (personal workspace by default). */
export async function resolveWorkspaceId(userId: string): Promise<string> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.workspace_id) return data.workspace_id;

  // Self-heal for accounts created before workspaces existed.
  const { data: created, error: wsError } = await supabase
    .from("workspaces")
    .insert({ name: "My workspace", owner_id: userId })
    .select("id")
    .single();
  if (wsError) throw wsError;
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: created.id, user_id: userId, role: "owner" });
  if (memberError) throw memberError;
  return created.id;
}

export async function listConnectionsForUser(userId: string): Promise<SocialConnection[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("social_connections")
    .select(
      "id, platform, account_id, account_name, username, avatar_url, scopes, token_expires_at, last_sync_at, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(toConnection);
}

export async function saveConnection(
  userId: string,
  platform: SocialPlatform,
  identity: {
    accountId: string;
    accountName: string;
    username: string | null;
    avatarUrl: string | null;
    accountType?: string | null;
    publishingEligible?: boolean;
  },
  tokens: { accessToken: string; refreshToken: string | null; expiresInSeconds: number | null; scopes: string[] },
  workspaceIdHint?: string | null,
) {
  const supabase = await db();
  const workspaceId = workspaceIdHint ?? (await resolveWorkspaceId(userId));
  const now = new Date().toISOString();
  // Reconnecting the same provider account updates the existing row —
  // unique(workspace_id, platform, account_id) prevents duplicates.
  const { data, error } = await supabase
    .from("social_connections")
    .upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        platform,
        account_id: identity.accountId,
        account_name: identity.accountName,
        username: identity.username,
        avatar_url: identity.avatarUrl,
        account_type: identity.accountType ?? null,
        publishing_eligible: identity.publishingEligible ?? true,
        connection_status: "connected",
        scopes: tokens.scopes,
        access_token_ciphertext: encryptToken(tokens.accessToken),
        refresh_token_ciphertext: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        token_expires_at: tokenExpiryIso(tokens.expiresInSeconds),
        last_refresh_at: now,
        last_refresh_error: null,
        refresh_failure_count: 0,
        disconnected_at: null,
        last_sync_at: now,
        updated_at: now,
      },
      { onConflict: "workspace_id,platform,account_id" },
    )
    .select("id")
    .single();
  if (error) {
    logSupabaseOAuthError({
      operation: "social_connection_upsert",
      table: "social_connections",
      provider: platform,
      userId,
      workspaceId,
      error,
    });
    console.error("[SOCIAL_CONNECTION_DB_WRITE_FAILED]", {
      table: "social_connections",
      operation: "upsert",
      user_id: userId,
      provider: platform,
      error_code: error.code ?? "unknown",
      error_message: error.message,
    });
    throw error;
  }

  const { error: eventError } = await supabase.from("social_account_events").insert({
    workspace_id: workspaceId,
    social_account_id: data.id,
    event_type: "connected",
    event_data: { platform, account_type: identity.accountType ?? null },
    created_by: userId,
  });
  if (eventError) {
    logSupabaseOAuthError({
      operation: "social_account_event_insert",
      table: "social_account_events",
      provider: platform,
      userId,
      workspaceId,
      error: eventError,
    });
    throw eventError;
  }

  // Facebook: rebuild permissions and Page credentials from the NEW user token
  // so a reconnect never keeps working with the previous connection's state.
  if (platform === "facebook") {
    try {
      const { data: existing } = await supabase
        .from("social_connections")
        .select("metadata")
        .eq("id", data.id)
        .maybeSingle();
      const { refreshFacebookConnectionMetadata } = await import("./facebook-graph.server");
      const metadata = await refreshFacebookConnectionMetadata({
        connectionId: data.id as string,
        userToken: tokens.accessToken,
        facebookUserId: identity.accountId,
        previousMetadata: (existing?.metadata ?? {}) as Record<string, unknown>,
      });
      await supabase
        .from("social_connections")
        .update({ metadata: metadata as never, updated_at: new Date().toISOString() })
        .eq("id", data.id);
    } catch (metaError) {
      console.error("[oauth:facebook] metadata refresh failed", metaError);
    }
  }

  return { connectionId: data.id as string, workspaceId };
}


export async function getConnectionTokens(userId: string, connectionId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("social_connections")
    .select("id, platform, access_token_ciphertext, refresh_token_ciphertext")
    .eq("user_id", userId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    platform: data.platform as SocialPlatform,
    accessToken: decryptToken(data.access_token_ciphertext),
    refreshToken: data.refresh_token_ciphertext ? decryptToken(data.refresh_token_ciphertext) : null,
  };
}

export async function updateConnectionTokens(
  userId: string,
  connectionId: string,
  tokens: { accessToken: string; refreshToken: string | null; expiresInSeconds: number | null; scopes: string[] },
) {
  const supabase = await db();
  const { error } = await supabase
    .from("social_connections")
    .update({
      access_token_ciphertext: encryptToken(tokens.accessToken),
      ...(tokens.refreshToken
        ? { refresh_token_ciphertext: encryptToken(tokens.refreshToken) }
        : {}),
      token_expires_at: tokenExpiryIso(tokens.expiresInSeconds),
      scopes: tokens.scopes,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", connectionId);
  if (error) throw error;
}

/**
 * Re-reads the live profile from the provider using the stored token and
 * persists the fresh name / username / avatar. Used by "Test connection" so a
 * re-authenticated account shows its updated profile picture immediately.
 */
export async function verifyConnection(userId: string, connectionId: string) {
  const supabase = await db();
  const stored = await getConnectionTokens(userId, connectionId);
  if (!stored) throw new Error("Connection not found");

  const identity = await providers[stored.platform].identity(stored.accessToken);
  const { error } = await supabase
    .from("social_connections")
    .update({
      account_id: identity.accountId,
      account_name: identity.accountName,
      username: identity.username,
      avatar_url: identity.avatarUrl,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", connectionId);
  if (error) throw error;

  return {
    accountId: identity.accountId,
    accountName: identity.accountName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
    checkedAt: new Date().toISOString(),
  };
}

export async function deleteConnection(userId: string, connectionId: string) {
  const supabase = await db();
  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("user_id", userId)
    .eq("id", connectionId);
  if (error) throw error;
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export type OAuthStateInput = {
  userId: string;
  workspaceId: string;
  platform: SocialPlatform;
  state: string;
  codeVerifier: string | null;
  returnPath: string;
  returnOrigin: string | null;
  existingAccountId: string | null;
  ttlMinutes?: number;
};

/** Stores only a hash of the state, bound to user + workspace + platform. */
export async function createOAuthState(input: OAuthStateInput) {
  const supabase = await db();
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (membershipError) {
    logSupabaseOAuthError({
      operation: "oauth_state_workspace_membership_select",
      table: "workspace_members",
      provider: input.platform,
      userId: input.userId,
      workspaceId: input.workspaceId,
      error: membershipError,
    });
    throw membershipError;
  }
  if (!membership) throw new Error("The authenticated user is not a member of this workspace.");

  // Drop states that already expired so the table stays tidy.
  const { error: cleanupError } = await supabase
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (cleanupError) {
    logSupabaseOAuthError({
      operation: "oauth_state_expired_cleanup_delete",
      table: "oauth_states",
      provider: input.platform,
      userId: input.userId,
      workspaceId: input.workspaceId,
      error: cleanupError,
    });
    throw cleanupError;
  }

  const hash = hashOAuthState(input.state);
  console.info("[OAUTH_STATE_INSERT]", {
    operation: "oauth_state_insert",
    table: "oauth_states",
    platform: input.platform,
    user_id_present: Boolean(input.userId),
    workspace_id_present: Boolean(input.workspaceId),
    using_admin_client: true,
  });
  const { error } = await supabase.from("oauth_states").insert({
    state: hash,
    state_hash: hash,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    platform: input.platform,
    code_verifier: input.codeVerifier ? encryptToken(input.codeVerifier) : null,
    return_path: input.returnPath,
    return_origin: input.returnOrigin,
    existing_account_id: input.existingAccountId,
    expires_at: new Date(Date.now() + (input.ttlMinutes ?? 15) * 60 * 1000).toISOString(),
  });
  if (error) {
    logSupabaseOAuthError({
      operation: "oauth_state_insert",
      table: "oauth_states",
      provider: input.platform,
      userId: input.userId,
      workspaceId: input.workspaceId,
      error,
    });
    console.error("[OAUTH_STATE_INSERT_FAILED]", {
      operation: "oauth_state_insert",
      table: "oauth_states",
      platform: input.platform,
      user_id_present: Boolean(input.userId),
      workspace_id_present: Boolean(input.workspaceId),
      using_admin_client: true,
      error_code: error.code ?? "unknown",
      error_message: error.message,
    });
    throw error;
  }
}

export type ConsumedOAuthState =
  | { ok: true; userId: string; workspaceId: string | null; platform: SocialPlatform; codeVerifier: string | null; returnPath: string; returnOrigin: string | null; existingAccountId: string | null }
  | { ok: false; reason: "state_invalid" | "state_expired" | "state_reused" };

/**
 * Single-use state consumption. The raw value never touches the database: we
 * look the row up by hash and claim it atomically via `consumed_at is null`.
 */
export async function consumeOAuthState(
  state: string,
  platform: SocialPlatform,
): Promise<ConsumedOAuthState> {
  const supabase = await db();
  const hash = hashOAuthState(state);
  const { data, error } = await supabase
    .from("oauth_states")
    .select(
      "state, user_id, workspace_id, platform, code_verifier, return_path, return_origin, existing_account_id, expires_at, consumed_at",
    )
    .eq("state_hash", hash)
    .maybeSingle();
  if (error) {
    logSupabaseOAuthError({
      operation: "oauth_state_select",
      table: "oauth_states",
      provider: platform,
      error,
    });
    throw error;
  }
  if (!data || data.platform !== platform) return { ok: false, reason: "state_invalid" };
  if (data.consumed_at) return { ok: false, reason: "state_reused" };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    const { error: expiredDeleteError } = await supabase
      .from("oauth_states")
      .delete()
      .eq("state_hash", hash);
    if (expiredDeleteError) {
      logSupabaseOAuthError({
        operation: "oauth_state_expired_delete",
        table: "oauth_states",
        provider: platform,
        userId: data.user_id,
        workspaceId: data.workspace_id,
        error: expiredDeleteError,
      });
      throw expiredDeleteError;
    }
    return { ok: false, reason: "state_expired" };
  }

  // The callback is unauthenticated at the browser boundary, so re-check the
  // state owner's workspace membership before accepting provider credentials.
  // This keeps the trusted admin client from turning a forged/stale state into
  // an account owned by an unrelated workspace.
  if (data.workspace_id) {
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (membershipError) {
      logSupabaseOAuthError({
        operation: "oauth_state_callback_membership_select",
        table: "workspace_members",
        provider: platform,
        userId: data.user_id,
        workspaceId: data.workspace_id,
        error: membershipError,
      });
      throw membershipError;
    }
    if (!membership) return { ok: false, reason: "state_invalid" };
  }

  const { data: claimed, error: claimError } = await supabase
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", hash)
    .is("consumed_at", null)
    .select("state")
    .maybeSingle();
  if (claimError) {
    logSupabaseOAuthError({
      operation: "oauth_state_claim_update",
      table: "oauth_states",
      provider: platform,
      userId: data.user_id,
      workspaceId: data.workspace_id,
      error: claimError,
    });
    throw claimError;
  }
  if (!claimed) return { ok: false, reason: "state_reused" };

  const { error: deleteError } = await supabase
    .from("oauth_states")
    .delete()
    .eq("state_hash", hash);
  if (deleteError) {
    logSupabaseOAuthError({
      operation: "oauth_state_consumed_delete",
      table: "oauth_states",
      provider: platform,
      userId: data.user_id,
      workspaceId: data.workspace_id,
      error: deleteError,
    });
    throw deleteError;
  }

  return {
    ok: true,
    userId: data.user_id,
    workspaceId: data.workspace_id ?? null,
    platform: data.platform as SocialPlatform,
    codeVerifier: data.code_verifier ? decryptToken(data.code_verifier) : null,
    returnPath: data.return_path ?? "/app/accounts",
    returnOrigin: data.return_origin ?? null,
    existingAccountId: data.existing_account_id ?? null,
  };
}

/**
 * Non-consuming lookup used by GET /api/public/oauth/connect/:platform, which
 * rebuilds the authorization URL server-side and 302s to the provider. The raw
 * state never touches the database (hash lookup only) and the decrypted PKCE
 * verifier stays on the server.
 */
export async function peekOAuthState(
  state: string,
  platform: SocialPlatform,
): Promise<
  | { ok: true; codeVerifier: string | null; returnPath: string }
  | { ok: false; reason: "state_invalid" | "state_expired" | "state_reused" }
> {
  const supabase = await db();
  const hash = hashOAuthState(state);
  const { data, error } = await supabase
    .from("oauth_states")
    .select("platform, code_verifier, return_path, expires_at, consumed_at")
    .eq("state_hash", hash)
    .maybeSingle();
  if (error) {
    logSupabaseOAuthError({
      operation: "oauth_state_peek_select",
      table: "oauth_states",
      provider: platform,
      error,
    });
    throw error;
  }
  if (!data || data.platform !== platform) return { ok: false, reason: "state_invalid" };
  if (data.consumed_at) return { ok: false, reason: "state_reused" };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "state_expired" };
  }
  return {
    ok: true,
    codeVerifier: data.code_verifier ? decryptToken(data.code_verifier) : null,
    returnPath: data.return_path ?? "/app/accounts",
  };
}
