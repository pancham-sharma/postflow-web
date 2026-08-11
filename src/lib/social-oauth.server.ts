// Server-only OAuth provider definitions for the six publishing platforms.
import { createHash } from "node:crypto";
import type { SocialPlatform } from "./social-platforms";
import {
  FACEBOOK_CONFIGURATION_ID_ENV,
  facebookBusinessAuthorizeParams,
} from "./facebook-oauth-config";
import {
  OAuthProviderError,
  oauthFailureDetails,
  oauthJsonOrThrow,
  oauthTransportError,
  type OAuthFailureStage,
} from "./oauth-provider-error.server";

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
  scopes: string[];
};

export type Identity = {
  accountId: string;
  accountName: string;
  username: string | null;
  avatarUrl: string | null;
  /** Provider account tier, when the provider reports one (e.g. BUSINESS). */
  accountType?: string | null;
  /** False when the provider account cannot publish through the API. */
  publishingEligible?: boolean;
};

/** Thrown when a linked Instagram account is Personal instead of Business/Creator. */
export class AccountNotProfessionalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountNotProfessionalError";
  }
}

export type ProviderConfig = {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Pinterest requires comma-separated scopes; OAuth2 default is a space. */
  scopeSeparator?: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Some providers use a non-standard client ID parameter name. */
  clientIdParam?: string;
  /** Facebook Login for Business supplies permissions through config_id. */
  configurationIdEnv?: string;
  omitScopes?: boolean;
  usePkce?: boolean;
  /** Basic-auth the token endpoint instead of posting the secret in the body. */
  tokenAuthBasic?: boolean;
  extraAuthorizeParams?: Record<string, string>;
  supportsRefresh: boolean;
  identity: (accessToken: string) => Promise<Identity>;
};

/** Thrown when a platform's backend secrets are missing or obviously placeholders. */
export class OAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigurationError";
  }
}

type ProviderJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  id?: string | number;
  user_id?: string | number;
  username?: string;
  name?: string;
  url?: string;
  account_type?: string;
  profile_picture_url?: string;
  business_name?: string;
  profile_image?: string;
  customUrl?: string;
  title?: string;
  externalId?: string;
  displayName?: string;
  data?: ProviderJson;
  items?: ProviderJson[];
  picture?: { data?: ProviderJson };
  snippet?: ProviderJson;
  thumbnails?: ProviderJson;
  default?: ProviderJson;
  me?: ProviderJson;
};

async function providerJson(
  platform: SocialPlatform,
  stage: OAuthFailureStage,
  endpoint: string,
  init?: RequestInit,
): Promise<ProviderJson> {
  const context = { platform, stage, endpoint };
  try {
    return await oauthJsonOrThrow<ProviderJson>(await fetch(endpoint, init), context);
  } catch (error) {
    if (error instanceof OAuthProviderError) throw error;
    throw oauthTransportError(context);
  }
}

async function getJson(platform: SocialPlatform, url: string, accessToken: string) {
  return providerJson(platform, "account_discovery", url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export const providers: Record<SocialPlatform, ProviderConfig> = {
  // Instagram API with Instagram Login — its own app credentials, its own
  // authorize/token endpoints and graph.instagram.com only. No Facebook Login
  // permissions, no Page discovery, no graph.facebook.com.
  instagram: {
    label: "Instagram",
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    // Instagram's authorize endpoint expects a comma-separated scope list.
    scopeSeparator: ",",
    clientIdEnv: "INSTAGRAM_OAUTH_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_OAUTH_CLIENT_SECRET",
    extraAuthorizeParams: { enable_fb_login: "0", force_authentication: "1" },
    supportsRefresh: true,
    identity: async (token) => {
      const me = await providerJson(
        "instagram",
        "account_discovery",
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(token)}`,
      );
      const accountType = String(me.account_type ?? "").toUpperCase();
      const eligible =
        accountType === "BUSINESS" || accountType === "CREATOR" || accountType === "MEDIA_CREATOR";
      if (accountType && !eligible) {
        throw new AccountNotProfessionalError(
          "This Instagram account is not eligible for API publishing. Switch it to a Business or Creator account and try again.",
        );
      }
      return {
        accountId: String(me.user_id ?? me.id),
        accountName: me.username ?? "Instagram account",
        username: me.username ? `@${me.username}` : null,
        avatarUrl: me.profile_picture_url ?? null,
        accountType: accountType || null,
        publishingEligible: true,
      };
    },
  },
  facebook: {
    label: "Facebook",
    // Unversioned dialog: the versioned one rejects apps whose Website
    // platform is not configured with "Invalid platform app".
    authorizeUrl: "https://www.facebook.com/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    // Facebook Login for Business supplies the selected permissions/assets via
    // config_id rather than the classic scope-based Login dialog.
    scopes: [],
    scopeSeparator: ",",
    clientIdEnv: "META_OAUTH_CLIENT_ID",
    clientSecretEnv: "META_OAUTH_CLIENT_SECRET",
    configurationIdEnv: FACEBOOK_CONFIGURATION_ID_ENV,
    omitScopes: true,
    supportsRefresh: true,
    identity: async (token) => {
      const me = await providerJson(
        "facebook",
        "account_discovery",
        `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${encodeURIComponent(token)}`,
      );
      return {
        accountId: String(me.id),
        accountName: me.name ?? "Facebook account",
        username: null,
        avatarUrl: me.picture?.data?.url ?? null,
      };
    },
  },
  pinterest: {
    label: "Pinterest",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"],
    scopeSeparator: ",",
    clientIdEnv: "PINTEREST_OAUTH_CLIENT_ID",
    clientSecretEnv: "PINTEREST_OAUTH_CLIENT_SECRET",

    tokenAuthBasic: true,
    supportsRefresh: true,
    identity: async (token) => {
      const me = await getJson("pinterest", "https://api.pinterest.com/v5/user_account", token);
      return {
        accountId: String(me.id ?? me.username),
        accountName: me.business_name || me.username || "Pinterest account",
        username: me.username ? `@${me.username}` : null,
        avatarUrl: me.profile_image ?? null,
      };
    },
  },
  youtube: {
    label: "YouTube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    clientIdEnv: "YOUTUBE_OAUTH_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_OAUTH_CLIENT_SECRET",
    extraAuthorizeParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    supportsRefresh: true,
    identity: async (token) => {
      const data = await getJson(
        "youtube",
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        token,
      );
      const channel = data.items?.[0];
      if (!channel) throw new Error("No YouTube channel found for this Google account");
      return {
        accountId: String(channel.id),
        accountName: channel.snippet?.title ?? "YouTube channel",
        username: channel.snippet?.customUrl ?? null,
        avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      };
    },
  },
  snapchat: {
    label: "Snapchat",
    authorizeUrl: "https://accounts.snapchat.com/accounts/oauth2/auth",
    tokenUrl: "https://accounts.snapchat.com/accounts/oauth2/token",
    // Minimal confidential-client flow: only display_name, which every Login Kit
    // client has enabled. Extra scopes (external_id) make Snapchat reject the
    // whole authorization request with "Failed to load authorization data".
    scopes: ["https://auth.snapchat.com/oauth2/api/user.display_name"],
    clientIdEnv: "SNAPCHAT_OAUTH_CLIENT_ID",
    clientSecretEnv: "SNAPCHAT_OAUTH_CLIENT_SECRET",
    // PKCE (S256) — the verifier stays server-side in the oauth_states row and
    // is replayed at token exchange alongside the identical redirect URI.
    usePkce: true,
    tokenAuthBasic: true,
    supportsRefresh: true,
    identity: async (token) => {
      type SnapchatIdentity = { externalId?: string; displayName?: string };
      const ask = async (query: string) =>
        providerJson("snapchat", "account_discovery", "https://kit.snapchat.com/v1/me", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        });
      // externalId needs its own approved scope; fall back to display name only.
      let me: SnapchatIdentity = {};
      try {
        me = (await ask("{me{externalId displayName}}")).data?.me ?? {};
      } catch {
        me = (await ask("{me{displayName}}")).data?.me ?? {};
      }
      const displayName = me.displayName ?? "Snapchat account";
      return {
        accountId: String(
          me.externalId ??
            createHash("sha256").update(`snapchat:${displayName}`).digest("hex").slice(0, 32),
        ),
        accountName: displayName,
        username: null,
        avatarUrl: null,
      };
    },
  },
};

const PLACEHOLDER_VALUES = new Set([
  "123456",
  "123456789",
  "changeme",
  "your_client_id",
  "your_app_id",
  "your-client-id",
  "fake-secret",
  "test",
  "todo",
  "placeholder",
]);

/**
 * Loads a platform's server-only OAuth credentials. Trims stray whitespace/quotes
 * (a pasted `"1234 "` is the usual cause of Pinterest's "we couldn't find that app")
 * and refuses obvious placeholders instead of redirecting the user to a 400 page.
 */
/** Alternate secret names people commonly paste for the same credential. */
const ENV_ALIASES: Record<string, string[]> = {
  INSTAGRAM_OAUTH_CLIENT_ID: ["INSTAGRAM_APP_ID", "INSTAGRAM_CLIENT_ID"],
  INSTAGRAM_OAUTH_CLIENT_SECRET: ["INSTAGRAM_APP_SECRET", "INSTAGRAM_CLIENT_SECRET"],
  META_OAUTH_CLIENT_ID: ["FACEBOOK_APP_ID", "FACEBOOK_OAUTH_CLIENT_ID"],
  META_OAUTH_CLIENT_SECRET: ["FACEBOOK_APP_SECRET", "FACEBOOK_OAUTH_CLIENT_SECRET"],
  PINTEREST_OAUTH_CLIENT_ID: ["PINTEREST_APP_ID"],
  PINTEREST_OAUTH_CLIENT_SECRET: ["PINTEREST_APP_SECRET"],
  YOUTUBE_OAUTH_CLIENT_ID: ["GOOGLE_OAUTH_CLIENT_ID"],
  YOUTUBE_OAUTH_CLIENT_SECRET: ["GOOGLE_OAUTH_CLIENT_SECRET"],
};

export function providerCredentials(platform: SocialPlatform) {
  const config = providers[platform];
  const clean = (raw: string | undefined) =>
    (raw ?? "")
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .trim();
  const readEnv = (name: string) => {
    for (const candidate of [name, ...(ENV_ALIASES[name] ?? [])]) {
      const value = clean(process.env[candidate]);
      if (value) return value;
    }
    return "";
  };
  const clientId = readEnv(config.clientIdEnv);
  const clientSecret = readEnv(config.clientSecretEnv);

  const invalid = (reason: string) =>
    new OAuthConfigurationError(
      `${config.label} connection is not configured (${reason}). Add the real app ID and app secret in backend secrets.`,
    );

  if (!clientId || !clientSecret) throw invalid("missing app ID or app secret");
  if (PLACEHOLDER_VALUES.has(clientId.toLowerCase())) throw invalid("placeholder app ID");
  if (PLACEHOLDER_VALUES.has(clientSecret.toLowerCase())) throw invalid("placeholder app secret");
  if (clientId === clientSecret) throw invalid("app ID and app secret are identical");
  if (/\s/.test(clientId)) throw invalid("app ID contains whitespace");

  if (platform === "snapchat") {
    // Login Kit requires S256 PKCE for both public and confidential clients.
    // Confidential clients additionally authenticate with their secret during
    // token exchange; they must not omit the authorization code challenge.
    return {
      config: { ...config, usePkce: true },
      clientId,
      clientSecret,
    };
  }

  if (platform === "facebook") {
    const configurationId = readEnv(config.configurationIdEnv ?? "");
    if (!configurationId || !/^\d+$/.test(configurationId)) {
      throw invalid("missing or invalid Facebook Login for Business configuration ID");
    }
    return {
      config: {
        ...config,
        scopes: [],
        omitScopes: true,
        extraAuthorizeParams: {
          ...(config.extraAuthorizeParams ?? {}),
          ...facebookBusinessAuthorizeParams(configurationId),
        },
      },
      clientId,
      clientSecret,
    };
  }

  return { config, clientId, clientSecret };
}

/** Dev-only diagnostics. Never returns the secret, and never the full client ID. */
export function providerConfigDiagnostics(platform: SocialPlatform, redirectUri: string) {
  const config = providers[platform];
  const clientId = (process.env[config.clientIdEnv] ?? "").trim();
  return {
    platform,
    clientIdConfigured: clientId.length > 0,
    clientIdPrefix: clientId ? clientId.slice(0, 4) : undefined,
    redirectUri,
    appEnvironment: process.env["NODE_ENV"] ?? "unknown",
  };
}

function basicHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function postToken(
  platform: SocialPlatform,
  body: Record<string, string>,
  stage: OAuthFailureStage = "token_exchange",
): Promise<TokenSet> {
  const { config, clientId, clientSecret } = providerCredentials(platform);
  const params = new URLSearchParams(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.tokenAuthBasic) {
    headers["Authorization"] = basicHeader(clientId, clientSecret);
  } else {
    params.set(config.clientIdParam ?? "client_id", clientId);
    params.set("client_secret", clientSecret);
  }
  if (config.tokenAuthBasic && config.clientIdParam) {
    params.set(config.clientIdParam, clientId);
  }

  const payload = await providerJson(platform, stage, config.tokenUrl, {
    method: "POST",
    headers,
    body: params,
  });

  const accessToken = payload.access_token ?? payload.data?.access_token;
  if (!accessToken) {
    const details = oauthFailureDetails({ platform, stage, endpoint: config.tokenUrl }, 200, {
      error_type: "malformed_provider_response",
      error_message: "The provider response did not include an access token.",
    });
    console.error(`[oauth:${platform}] ${stage} failed`, details);
    throw new OAuthProviderError(details);
  }
  const scopeValue: string = payload.scope ?? payload.data?.scope ?? "";
  return {
    accessToken,
    refreshToken: payload.refresh_token ?? payload.data?.refresh_token ?? null,
    expiresInSeconds: Number(payload.expires_in ?? payload.data?.expires_in ?? 0) || null,
    scopes: scopeValue ? scopeValue.split(/[\s,]+/).filter(Boolean) : config.scopes,
  };
}

export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
  redirectUri: string,
  codeVerifier: string | null,
): Promise<TokenSet> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };
  if (codeVerifier) body["code_verifier"] = codeVerifier;
  const tokens = await postToken(platform, body);

  // Instagram/Facebook short-lived tokens are swapped for long-lived ones.
  if (platform === "instagram") {
    const { clientSecret } = providerCredentials("instagram");
    const long = await providerJson(
      "instagram",
      "token_upgrade",
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(clientSecret)}&access_token=${encodeURIComponent(tokens.accessToken)}`,
    );
    return {
      ...tokens,
      accessToken: long.access_token ?? tokens.accessToken,
      expiresInSeconds: Number(long.expires_in ?? 0) || tokens.expiresInSeconds,
    };
  }
  if (platform === "facebook") {
    const { clientId, clientSecret } = providerCredentials("facebook");
    const long = await providerJson(
      "facebook",
      "token_upgrade",
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(tokens.accessToken)}`,
    );
    // Store only what Meta actually returned — never an invented expiry.
    return {
      ...tokens,
      accessToken: long.access_token ?? tokens.accessToken,
      expiresInSeconds: Number(long.expires_in ?? 0) || tokens.expiresInSeconds,
    };
  }
  return tokens;
}

export async function refreshTokens(
  platform: SocialPlatform,
  refreshToken: string | null,
  accessToken: string,
): Promise<TokenSet> {
  const { config, clientId, clientSecret } = providerCredentials(platform);

  // Long-lived Meta tokens are extended, not refreshed.
  if (platform === "instagram") {
    const data = await providerJson(
      "instagram",
      "token_upgrade",
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`,
    );
    return {
      accessToken: data.access_token ?? accessToken,
      refreshToken: null,
      expiresInSeconds: Number(data.expires_in ?? 0) || null,
      scopes: config.scopes,
    };
  }
  if (platform === "facebook") {
    const data = await providerJson(
      "facebook",
      "token_upgrade",
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(accessToken)}`,
    );
    return {
      accessToken: data.access_token ?? accessToken,
      refreshToken: null,
      expiresInSeconds: Number(data.expires_in ?? 0) || null,
      scopes: config.scopes,
    };
  }

  if (!refreshToken) {
    throw new Error(`${config.label} has no refresh token — reconnect the account.`);
  }
  return postToken(
    platform,
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    "token_upgrade",
  );
}

/**
 * Pre-flight redirect_uri check.
 *
 * Sends a deliberately invalid authorization code to the provider's token
 * endpoint with the exact redirect_uri we are about to use. The code is
 * rejected either way, but the *reason* tells us whether the redirect URI (and
 * app credentials) are registered:
 *   - complaint mentions redirect_uri  -> not registered in the dashboard
 *   - complaint mentions client/app    -> wrong app ID / secret
 *   - complaint mentions the code/grant -> redirect_uri and app are accepted
 * Never returns provider payloads or secrets to the caller.
 */
export async function verifyRedirectUriRegistration(
  platform: SocialPlatform,
  redirectUri: string,
): Promise<{ ok: boolean; code: string; detail: string }> {
  const { config, clientId, clientSecret } = providerCredentials(platform);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: "postflow-preflight-invalid-code",
    redirect_uri: redirectUri,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.tokenAuthBasic) {
    headers["Authorization"] = basicHeader(clientId, clientSecret);
    if (config.clientIdParam) params.set(config.clientIdParam, clientId);
  } else {
    params.set(config.clientIdParam ?? "client_id", clientId);
    params.set("client_secret", clientSecret);
  }

  let text = "";
  try {
    const res = await fetch(config.tokenUrl, { method: "POST", headers, body: params });
    text = (await res.text()).slice(0, 600).toLowerCase();
  } catch {
    return {
      ok: false,
      code: "unreachable",
      detail: `Could not reach ${config.label}. Check your connection and try again.`,
    };
  }

  if (text.includes("redirect_uri") || text.includes("redirect uri")) {
    return {
      ok: false,
      code: "redirect_uri_mismatch",
      detail: `${config.label} does not recognise this redirect URI. Add it exactly as shown to your ${config.label} app.`,
    };
  }
  if (
    text.includes("invalid_client") ||
    text.includes("couldn't find that app") ||
    text.includes("could not find that app") ||
    text.includes("unauthorized_client")
  ) {
    return {
      ok: false,
      code: "app_not_found",
      detail: `${config.label} rejected the configured app ID or secret.`,
    };
  }
  return {
    ok: true,
    code: "ready",
    detail: `${config.label} accepted this redirect URI and app credentials.`,
  };
}
