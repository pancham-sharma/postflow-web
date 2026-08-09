// GET /api/public/oauth/connect/:platform
//
// Top-level browser entry point for provider consent. The browser navigates
// here (window.location.assign) and we answer with an HTTP 302 to the provider's
// own authorization endpoint — Snapchat's is
// https://accounts.snapchat.com/accounts/oauth2/auth.
//
// Nothing here is ever fetched with XHR/axios: providers reject AJAX/framed
// authorization requests ("Failed to load authorization data", HTTP 400) and the
// browser would additionally block it by CORS.
//
// The client id, client secret, PKCE verifier and raw state stay server-side.
// The short-lived `?s=` handoff refers to a pending, hashed, single-use
// oauth_states row created by the authenticated `startPlatformConnect` server
// function, which is what binds this flow to a user + workspace.
import { createFileRoute } from "@tanstack/react-router";
import { isSocialPlatform } from "@/lib/social-platforms";

/** Names that must exist in backend secrets for the Snapchat flow to work. */
const SNAPCHAT_ENV = [
  "SNAPCHAT_OAUTH_CLIENT_ID",
  "SNAPCHAT_OAUTH_CLIENT_SECRET",
  "SNAPCHAT_REDIRECT_URI",
] as const;

export const STATE_COOKIE_PREFIX = "pf_oauth_state_";

export const Route = createFileRoute("/api/public/oauth/connect/$platform")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const platform = params.platform;
        if (!isSocialPlatform(platform)) {
          return new Response("Unknown platform", { status: 404 });
        }

        const { postflowAppUrlOrNull, providerCallbackUrl } = await import(
          "@/lib/app-url.server"
        );
        const { resolvePublicOrigin, callbackUrl } = await import("@/lib/public-origin");
        const { providerCredentials } = await import("@/lib/social-oauth.server");
        const { peekOAuthState } = await import("@/lib/social-connections.server");
        const { returnPathWithResult, DEFAULT_OAUTH_RETURN_PATH } = await import(
          "@/lib/oauth-return-path"
        );
        const { createHash } = await import("node:crypto");

        const appUrl = postflowAppUrlOrNull();
        const base = appUrl ?? resolvePublicOrigin(request);
        const failTo = (reason: string, message: string) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: new URL(
                returnPathWithResult(DEFAULT_OAUTH_RETURN_PATH, {
                  oauth: "failed",
                  platform,
                  reason,
                  connect_error: message,
                  connect_error_code: reason,
                  connect_platform: platform,
                }),
                base,
              ).toString(),
            },
          });

        // Startup/entry validation of required configuration.
        if (platform === "snapchat") {
          const missing = SNAPCHAT_ENV.filter((name) => !(process.env[name] ?? "").trim());
          if (missing.length > 0) {
            console.error("[oauth:snapchat] missing configuration", { missing });
            return failTo(
              "not_configured",
              `Snapchat is not configured yet (missing ${missing.join(", ")}).`,
            );
          }
        }

        const state = new URL(request.url).searchParams.get("s");
        if (!state) return failTo("state_invalid", "This connect link is no longer valid.");

        const pending = await peekOAuthState(state, platform);
        if (!pending.ok) {
          return failTo(pending.reason, "This connect link expired. Please try again.");
        }

        let creds: { config: { authorizeUrl: string; scopes: string[]; scopeSeparator?: string; clientIdParam?: string; extraAuthorizeParams?: Record<string, string>; usePkce?: boolean }; clientId: string };
        try {
          creds = providerCredentials(platform) as typeof creds;
        } catch (error) {
          console.error(`[oauth:${platform}] credentials unavailable`);
          return failTo(
            "not_configured",
            error instanceof Error ? error.message : "Provider is not configured.",
          );
        }
        const { config, clientId } = creds;

        // Byte-identical to the URI used at token exchange time. A
        // <PLATFORM>_REDIRECT_URI secret always wins so it matches the value
        // registered in the provider portal exactly.
        const { providerRedirectUriOverride } = await import("@/lib/app-url.server");
        const redirectUri =
          providerRedirectUriOverride(platform) ??
          (appUrl
            ? providerCallbackUrl(platform, appUrl)
            : callbackUrl(resolvePublicOrigin(request), platform));

        const authorizeUrl = new URL(config.authorizeUrl);
        const search = new URLSearchParams({
          response_type: "code",
          [config.clientIdParam ?? "client_id"]: clientId,
          redirect_uri: redirectUri,
          scope: config.scopes.join(config.scopeSeparator ?? " "),
          state,
          ...(config.extraAuthorizeParams ?? {}),
        });
        if (config.usePkce && pending.codeVerifier) {
          search.set(
            "code_challenge",
            createHash("sha256").update(pending.codeVerifier).digest("base64url"),
          );
          search.set("code_challenge_method", "S256");
        }
        authorizeUrl.search = search.toString();

        // Safe diagnostics only: no secret, code, verifier, token or raw state.
        const redactedUrl = (() => {
          const u = new URL(authorizeUrl.toString());
          if (u.searchParams.has("state")) u.searchParams.set("state", "REDACTED");
          return u.toString();
        })();
        // Final decoded parameters, exactly as the browser will send them.
        const decodedParams = Object.fromEntries(
          [...search.entries()].map(([key, value]) => [
            key,
            key === "state" ? "REDACTED" : value,
          ]),
        );
        console.info(`[oauth:${platform}] authorize redirect`, {
          endpoint: `${authorizeUrl.origin}${authorizeUrl.pathname}`,
          clientIdPrefix: clientId.slice(0, 8),
          ...(platform === "snapchat"
            ? {
                snapchatClientVariant:
                  clientId === (process.env["SNAPCHAT_OAUTH_PUBLIC_CLIENT_ID"] ?? "").trim()
                    ? "public"
                    : "confidential",
              }
            : {}),
          redirectUri,
          responseType: "code",
          scope: config.scopes.join(config.scopeSeparator ?? " "),
          scopeCount: config.scopes.length,
          decodedParams,
          authorizationUrl: redactedUrl,
          hasState: true,
          hasCodeChallenge: search.has("code_challenge"),
          codeChallengeMethod: search.get("code_challenge_method"),
        });



        const headers = new Headers({ Location: authorizeUrl.toString() });
        // HTTP-only, SameSite=Lax so it survives the provider's top-level
        // redirect back to /api/public/oauth/callback/:platform, where it is
        // compared to the returned state with a timing-safe comparison.
        headers.append(
          "Set-Cookie",
          `${STATE_COOKIE_PREFIX}${platform}=${encodeURIComponent(state)}; Path=/api/public/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
