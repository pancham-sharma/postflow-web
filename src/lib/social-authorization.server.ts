import { getRequest } from "@tanstack/react-start/server";
import type { SocialPlatform } from "@/lib/social-platforms";

export async function buildSocialAuthorization(args: {
  platform: SocialPlatform;
  userId: string;
  clientOrigin: string | null;
  returnPath: string;
  existingAccountId: string | null;
}) {
  const { randomBytes, createHash } = await import("node:crypto");
  const { providerCredentials } = await import("@/lib/social-oauth.server");
  const { createOAuthState, resolveWorkspaceId } = await import(
    "@/lib/social-connections.server"
  );
  const { postflowAppUrlOrNull, providerCallbackUrl, providerRedirectUriOverride } =
    await import("@/lib/app-url.server");
  const { resolvePublicOrigin, callbackUrl } = await import("@/lib/public-origin");
  const { sanitizeReturnPath } = await import("@/lib/oauth-return-path");

  const safeReturnOrigin = (() => {
    if (!args.clientOrigin) return null;
    try {
      const candidate = new URL(args.clientOrigin);
      const allowedHost =
        candidate.hostname === "localhost" ||
        candidate.hostname.endsWith(".lovable.app") ||
        candidate.hostname.endsWith(".lovableproject.com");
      return candidate.protocol === "https:" && allowedHost ? candidate.origin : null;
    } catch {
      return null;
    }
  })();

  const appUrl = postflowAppUrlOrNull();
  const override = providerRedirectUriOverride(args.platform);
  let redirectUri: string;
  if (override) {
    redirectUri = override;
  } else if (appUrl) {
    redirectUri = providerCallbackUrl(args.platform, appUrl);
  } else {
    const request = getRequest();
    if (!request) throw new Error("Connect must start from an app request.");
    redirectUri = callbackUrl(resolvePublicOrigin(request, args.clientOrigin), args.platform);
  }

  const { config, clientId } = providerCredentials(args.platform);
  const state = randomBytes(32).toString("base64url");
  const requiresPkce = args.platform === "snapchat" || Boolean(config.usePkce);
  const codeVerifier = requiresPkce ? randomBytes(48).toString("base64url") : null;

  const authorizeUrl = new URL(config.authorizeUrl);
  const params = new URLSearchParams({
    [config.clientIdParam ?? "client_id"]: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(config.scopeSeparator ?? " "),
    state,
    ...(config.extraAuthorizeParams ?? {}),
  });
  if (codeVerifier) {
    params.set("code_challenge", createHash("sha256").update(codeVerifier).digest("base64url"));
    params.set("code_challenge_method", "S256");
  }
  authorizeUrl.search = params.toString();

  console.info(`[oauth:${args.platform}] starting authorization`, {
    clientIdPrefix: clientId.slice(0, 4),
    redirectUri,
    hasCodeChallenge: params.has("code_challenge"),
  });

  const workspaceId = await resolveWorkspaceId(args.userId);
  await createOAuthState({
    userId: args.userId,
    workspaceId,
    platform: args.platform,
    state,
    codeVerifier,
    returnPath: sanitizeReturnPath(args.returnPath),
    returnOrigin: safeReturnOrigin,
    existingAccountId: args.existingAccountId,
  });

  const connectOrigin = new URL(redirectUri).origin;
  return {
    authorizeUrl: authorizeUrl.toString(),
    connectUrl: `${connectOrigin}/api/public/oauth/connect/${args.platform}?s=${encodeURIComponent(state)}`,
  };
}