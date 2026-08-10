// OAuth redirect target for every platform. Public by design: the provider
// redirects the browser here with ?code&state. The hashed, single-use state row
// identifies the user and workspace, so no session cookie is required — but the
// state must exist, be unexpired, unused, and match the platform in the path.
//
// Authorization codes are exchanged here, server-side only. Tokens are
// encrypted before storage and never appear in a redirect, response or log.
import { createFileRoute } from "@tanstack/react-router";
import { isSocialPlatform } from "@/lib/social-platforms";
import { callbackUrl, resolvePublicOrigin } from "@/lib/public-origin";
import { parseOAuthCallbackInput } from "@/lib/oauth-callback-input";

export const Route = createFileRoute("/api/public/oauth/callback/$platform")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const platform = params.platform;

        if (!isSocialPlatform(platform)) {
          return new Response("Unknown platform", { status: 404 });
        }

        const { postflowAppUrlOrNull, providerCallbackUrl, providerRedirectUriOverride } =
          await import("@/lib/app-url.server");
        const {
          oauthErrorMessage,
          oauthErrorMessageForCode,
          OAUTH_ERROR_MESSAGES,
          classifyOAuthError,
        } = await import("@/lib/oauth-errors");
        const { returnPathWithResult, DEFAULT_OAUTH_RETURN_PATH } =
          await import("@/lib/oauth-return-path");

        const appUrl = postflowAppUrlOrNull();
        let base = appUrl ?? resolvePublicOrigin(request);
        let returnPath = DEFAULT_OAUTH_RETURN_PATH;

        const redirectTo = (extra: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: new URL(returnPathWithResult(returnPath, extra), base).toString(),
            },
          });

        // Every failure exit carries a stable, safe code — never a provider
        // payload, token, code, state or stack trace.
        const fail = (code: string, message: string) =>
          redirectTo({
            oauth: "failed",
            platform,
            reason: code,
            connect_error: message,
            connect_error_code: code,
            connect_platform: platform,
          });

        const input = parseOAuthCallbackInput(url.searchParams);
        if (!input.ok && input.reason === "provider_error") {
          const { oauthFailureDetails } = await import("@/lib/oauth-provider-error.server");
          const details = oauthFailureDetails(
            {
              platform,
              stage: "authorization_response",
              endpoint: `${url.origin}${url.pathname}`,
            },
            null,
            { error: { code: input.providerErrorCode, error_message: input.providerError } },
          );
          console.error(`[oauth:${platform}] authorization_response failed`, details);
          const callbackCode =
            input.providerErrorCode === "access_denied"
              ? "access_denied"
              : classifyOAuthError(input.providerError);
          return fail(callbackCode, oauthErrorMessage(input.providerError));
        }

        if (!input.ok) {
          console.error(`[oauth:${platform}] callback missing parameters`, {
            hasCode: input.reason !== "missing_code",
            hasState: input.reason !== "missing_state",
          });
          return fail(
            "invalid_callback",
            `Missing ${input.reason === "missing_code" ? "authorization code" : "state"} in the ${platform} callback. Please start the connection again.`,
          );
        }
        const { code, state } = input;

        // When the flow started through /api/public/oauth/connect/:platform the
        // raw state is also in an HTTP-only cookie. Compare timing-safely.
        const cookieState = (request.headers.get("cookie") ?? "")
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`pf_oauth_state_${platform}=`))
          ?.split("=")
          .slice(1)
          .join("=");
        if (cookieState) {
          const { timingSafeEqual } = await import("node:crypto");
          let decodedCookieState: string;
          try {
            decodedCookieState = decodeURIComponent(cookieState);
          } catch {
            console.error(`[oauth:${platform}] malformed state cookie`);
            return fail("state_invalid", OAUTH_ERROR_MESSAGES.state_invalid);
          }
          const a = Buffer.from(decodedCookieState);
          const b = Buffer.from(state);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            console.error(`[oauth:${platform}] state cookie mismatch`);
            return fail("state_invalid", OAUTH_ERROR_MESSAGES.state_invalid);
          }
        }

        const { consumeOAuthState, saveConnection } =
          await import("@/lib/social-connections.server");
        const pending = await consumeOAuthState(state, platform);
        if (!pending.ok) {
          return fail(pending.reason, OAUTH_ERROR_MESSAGES[pending.reason]);
        }
        returnPath = pending.returnPath;
        // The callback runs on the stable public API host, but in preview the
        // authenticated app lives on a different origin. Return there so users
        // see the connection result instead of the host's Forbidden page.
        if (pending.returnOrigin) base = pending.returnOrigin;

        try {
          const { exchangeCode, providers, AccountNotProfessionalError } =
            await import("@/lib/social-oauth.server");
          // Byte-identical to the URI used to start the flow.
          const redirectUri =
            providerRedirectUriOverride(platform) ??
            (appUrl
              ? providerCallbackUrl(platform, appUrl)
              : callbackUrl(resolvePublicOrigin(request), platform));

          const tokens = await exchangeCode(platform, code, redirectUri, pending.codeVerifier);
          if (!tokens.accessToken) throw new Error("token_exchange_failed");

          let identity;
          try {
            identity = await providers[platform].identity(tokens.accessToken);
          } catch (error) {
            if (error instanceof AccountNotProfessionalError) {
              return fail("account_not_professional", error.message);
            }
            throw error;
          }
          if (!identity.accountId) throw new Error("Provider returned no account id");

          try {
            await saveConnection(pending.userId, platform, identity, tokens, pending.workspaceId);
          } catch (error) {
            // A database failure is distinct from a provider failure; no raw
            // database payload is logged because it can contain account data.
            console.error(`[oauth:${platform}] connection_storage failed`, {
              platform,
              stage: "connection_storage",
              errorType: error instanceof Error ? error.name : "unknown_error",
            });
            return fail(
              "connection_storage_failed",
              oauthErrorMessageForCode("connection_storage_failed"),
            );
          }
          return redirectTo({ oauth: "success", platform, connected: platform });
        } catch (error) {
          const { OAuthProviderError } = await import("@/lib/oauth-provider-error.server");
          if (error instanceof OAuthProviderError) {
            const callbackCode =
              error.details.stage === "account_discovery"
                ? "account_discovery_failed"
                : classifyOAuthError(
                    [error.details.errorCode, error.details.errorType, error.details.errorMessage]
                      .filter(Boolean)
                      .join(" "),
                  );
            return fail(callbackCode, oauthErrorMessageForCode(callbackCode));
          }
          // Full detail stays in server logs; the browser only sees a safe code.
          console.error(`[oauth:${platform}] callback failed`, {
            errorType: error instanceof Error ? error.name : "unknown_error",
          });
          const raw = error instanceof Error ? error.message : null;
          return fail(classifyOAuthError(raw), oauthErrorMessage(raw));
        }
      },
    },
  },
});
