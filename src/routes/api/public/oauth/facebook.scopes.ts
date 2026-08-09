// GET /api/public/oauth/facebook/scopes
// Temporary debug endpoint: reports exactly which scopes the Facebook
// authorization URL requests. Never returns tokens, codes or secrets.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/facebook/scopes")({
  server: {
    handlers: {
      GET: async () => {
        const { facebookOAuthDebugPayload } = await import("@/lib/meta-scopes.server");
        const payload = facebookOAuthDebugPayload();
        console.info("[META_OAUTH_SCOPES]", payload.scopes.join(","));
        return new Response(JSON.stringify(payload, null, 2), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
