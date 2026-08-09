// Snapchat Public Profile (Business OAuth) redirect target.
// Public by design: Snapchat redirects the browser here with ?code&state.
// The single-use, hashed state row identifies the PostFlow user, so no session
// cookie is required. Codes and tokens are exchanged server-side and never
// logged, returned or placed in a redirect.
import { createFileRoute } from "@tanstack/react-router";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const Route = createFileRoute("/api/public/oauth/snapchat-public-profile/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { returnPathWithResult } = await import("@/lib/oauth-return-path");
        const service = await import("@/lib/snapchat-public-profile.server");
        const { consumeOAuthState, resolveWorkspaceId } = await import(
          "@/lib/social-connections.server"
        );

        let base = (process.env["POSTFLOW_APP_URL"] ?? "").trim() || resolvePublicOrigin(request);
        let returnPath = "/app/accounts";
        const finish = (extra: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: { Location: new URL(returnPathWithResult(returnPath, extra), base).toString() },
          });

        console.info("[SNAP_PP_OAUTH_CALLBACK] received");

        const providerError = url.searchParams.get("error");
        const providerDescription = url.searchParams.get("error_description");
        if (providerError || providerDescription) {
          return finish({
            snapchat_pp: "failed",
            reason: providerError === "access_denied" ? "access_denied" : "provider_error",
          });
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) {
          console.warn("[SNAP_PP_OAUTH_CALLBACK] missing parameters", {
            hasCode: Boolean(code),
            hasState: Boolean(state),
          });
          return finish({ snapchat_pp: "failed", reason: "invalid_callback" });
        }

        const pending = await consumeOAuthState(state, "snapchat");
        if (!pending.ok) return finish({ snapchat_pp: "failed", reason: pending.reason });
        returnPath = pending.returnPath;
        if (pending.returnOrigin) base = pending.returnOrigin;

        try {
          const redirect = service.redirectUri(pending.returnOrigin);
          const tokens = await service.exchangeCode(code, redirect, pending.codeVerifier);
          const workspaceId =
            pending.workspaceId ?? (await resolveWorkspaceId(pending.userId));
          await service.storeConnection({ userId: pending.userId, workspaceId, tokens });

          // Real capability verification — automatic publishing is only ever
          // enabled when Snapchat actually answers the Public Profile API.
          const report = await service.verifyCapability(pending.userId);
          return finish({
            snapchat_pp: report.available ? "connected" : "manual_only",
            reason: report.reason,
          });
        } catch (error) {
          console.error("[SNAP_PP_OAUTH_CALLBACK] failed", {
            code: (error as { code?: string })?.code ?? "unknown",
          });
          return finish({ snapchat_pp: "failed", reason: "exchange_failed" });
        }
      },
    },
  },
});
