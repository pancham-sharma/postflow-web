import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSocialPlatform, type SocialConnection } from "@/lib/social-platforms";

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialConnection[]> => {
    const { listConnectionsForUser } = await import("@/lib/social-connections.server");
    return listConnectionsForUser(context.userId);
  });

export const startPlatformConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: string; origin?: string; returnPath?: string }) => {
    if (!isSocialPlatform(input.platform)) throw new Error("Unknown platform");
    return {
      platform: input.platform,
      origin: input.origin ?? null,
      returnPath: input.returnPath ?? "/app/accounts",
    };
  })
  .handler(async ({ data, context }) => {
    const { buildSocialAuthorization } = await import("@/lib/social-authorization.server");
    return buildSocialAuthorization({
      platform: data.platform,
      userId: context.userId,
      clientOrigin: data.origin,
      returnPath: data.returnPath,
      existingAccountId: null,
    });
  });

/**
 * Instagram API with Instagram Login. Returns nothing but the authorization
 * URL — no app id, secret, state or PKCE verifier ever reaches the browser.
 */
export const startInstagramOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { returnPath?: string; existingAccountId?: string; origin?: string }) => {
    const returnPath = typeof input?.returnPath === "string" ? input.returnPath : "/app/accounts";
    const existingAccountId =
      typeof input?.existingAccountId === "string" && input.existingAccountId.length <= 128
        ? input.existingAccountId
        : null;
    const origin = typeof input?.origin === "string" ? input.origin.slice(0, 300) : null;
    return { returnPath: returnPath.slice(0, 500), existingAccountId, origin };
  })
  .handler(async ({ data, context }) => {
    const { buildSocialAuthorization } = await import("@/lib/social-authorization.server");
    return buildSocialAuthorization({
      platform: "instagram",
      userId: context.userId,
      // Return the user to the origin they started from; the canonical app
      // host is not browsable while the project is unpublished (403 Forbidden).
      clientOrigin: data.origin,
      returnPath: data.returnPath,
      existingAccountId: data.existingAccountId,
    });
  });

/**
 * Configuration status for the Connected Accounts UI. Returns booleans and the
 * exact callback URL the project owner must register — never any credential.
 */
export const getOAuthPlatformStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { providerCredentials, providers } = await import("@/lib/social-oauth.server");
    const { postflowAppUrlOrNull, providerCallbackUrl } = await import("@/lib/app-url.server");

    const appUrl = postflowAppUrlOrNull();
    let configured = false;
    let message: string | undefined;
    try {
      providerCredentials("instagram");
      configured = true;
    } catch (error) {
      message =
        "Instagram has not been configured. Add the Instagram App ID and App Secret in Lovable backend secrets.";
      void error;
    }
    if (!appUrl) {
      configured = false;
      message =
        "Instagram has not been configured. Add POSTFLOW_APP_URL (the published PostFlow URL) in Lovable backend secrets.";
    }

    return {
      platform: "instagram" as const,
      configured,
      oauthEnabled: configured,
      publishingConfigured:
        configured &&
        providers.instagram.scopes.includes("instagram_business_content_publish"),
      appReviewRequired: true,
      callbackUrl: appUrl
        ? providerCallbackUrl("instagram", appUrl)
        : "<POSTFLOW_APP_URL>/api/public/oauth/callback/instagram",
      appUrl,
      scopes: providers.instagram.scopes,
      ...(message ? { message } : {}),
    };
  });



export const refreshConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { getConnectionTokens, updateConnectionTokens } = await import(
      "@/lib/social-connections.server"
    );
    const { refreshTokens } = await import("@/lib/social-oauth.server");

    const stored = await getConnectionTokens(context.userId, data.connectionId);
    if (!stored) throw new Error("Connection not found");
    const tokens = await refreshTokens(
      stored.platform,
      stored.refreshToken,
      stored.accessToken,
    );
    await updateConnectionTokens(context.userId, data.connectionId, tokens);
    return { ok: true };
  });

export const disconnectConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { deleteConnection } = await import("@/lib/social-connections.server");
    await deleteConnection(context.userId, data.connectionId);
    return { ok: true };
  });

/**
 * Connection health check that never publishes anything: confirms the stored
 * token decrypts, can be renewed and still carries the required scopes.
 * Returns status only — no token value ever crosses the wire.
 */
export const checkConnectionHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) => {
    if (!input?.connectionId) throw new Error("Missing connection");
    return { connectionId: input.connectionId };
  })
  .handler(async ({ data, context }) => {
    const { getConnectionTokens } = await import("@/lib/social-connections.server");
    // Ownership check before touching the admin-scoped health probe.
    const owned = await getConnectionTokens(context.userId, data.connectionId);
    if (!owned) throw new Error("Connection not found");

    const { checkConnectionHealth } = await import("@/lib/token-refresh.server");
    const health = await checkConnectionHealth(data.connectionId);
    return {
      ok: health.ok,
      platform: health.platform,
      status: health.status,
      reason: health.reason,
      accessTokenExpiresAt: health.accessTokenExpiresAt,
      hasRefreshToken: health.hasRefreshToken,
      lastRefreshAt: health.lastRefreshAt,
      scopes: health.scopes,
      missingScopes: health.missingScopes,
      publishingCapable: health.publishingCapable,
    };
  });

/**
 * Confirms a stored token still works by fetching the live profile from the
 * provider, then persisting the refreshed name / handle / avatar. No secret or
 * token ever crosses the wire — only the resulting public profile fields.
 */
export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) => {
    if (!input?.connectionId) throw new Error("Missing connection");
    return { connectionId: input.connectionId };
  })
  .handler(async ({ data, context }) => {
    const { verifyConnection } = await import("@/lib/social-connections.server");
    const { oauthErrorMessage } = await import("@/lib/oauth-errors");
    try {
      const profile = await verifyConnection(context.userId, data.connectionId);
      return { ok: true as const, profile, message: "Token is valid and the profile was refreshed." };
    } catch (error) {
      console.error("[oauth] connection test failed", error);
      return {
        ok: false as const,
        profile: null,
        message: oauthErrorMessage(error instanceof Error ? error.message : null),
      };
    }
  });

/**
 * Pre-flight before we redirect anywhere: reports the exact redirect_uri this
 * app will send and whether the provider already recognises it, so a mismatch
 * with the developer dashboard is caught before the user leaves the app.
 */
export const preflightConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: string; origin?: string }) => {
    if (!isSocialPlatform(input.platform)) throw new Error("Unknown platform");
    return { platform: input.platform, origin: input.origin ?? null };
  })
  .handler(async ({ data }) => {
    const { resolvePublicOrigin, callbackUrl } = await import("@/lib/public-origin");
    const { postflowAppUrlOrNull, providerCallbackUrl, providerRedirectUriOverride } = await import(
      "@/lib/app-url.server"
    );
    const { verifyRedirectUriRegistration, OAuthConfigurationError } = await import(
      "@/lib/social-oauth.server"
    );
    const appUrl = postflowAppUrlOrNull();
    const override = providerRedirectUriOverride(data.platform);
    let redirectUri: string;
    if (override) {
      redirectUri = override;
    } else if (appUrl) {
      redirectUri = providerCallbackUrl(data.platform, appUrl);
    } else if (data.platform === "instagram") {
      return {
        ok: false,
        code: "configuration_missing",
        detail:
          "Instagram has not been configured. Add POSTFLOW_APP_URL (the published PostFlow URL) in Lovable backend secrets.",
        redirectUri: "<POSTFLOW_APP_URL>/api/public/oauth/callback/instagram",
        clientIdPrefix: null,
      };
    } else {
      const request = getRequest();
      if (!request) throw new Error("Pre-flight must start from an app request.");
      redirectUri = callbackUrl(resolvePublicOrigin(request, data.origin), data.platform);
    }

    // Safe identifier only — the first characters of the client id, so the
    // owner can confirm the portal app matches without exposing the secret.
    let clientIdPrefix: string | null = null;
    try {
      const { providerCredentials } = await import("@/lib/social-oauth.server");
      clientIdPrefix = providerCredentials(data.platform).clientId.slice(0, 8);
    } catch {
      clientIdPrefix = null;
    }

    try {
      const result = await verifyRedirectUriRegistration(data.platform, redirectUri);
      return { ...result, redirectUri, clientIdPrefix };
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return {
          ok: false,
          code: "invalid_configuration",
          detail: error.message,
          redirectUri,
          clientIdPrefix,
        };
      }
      throw error;
    }
  });
