// Cron-driven publishing runner. Public prefix so pg_cron can reach it; the
// Supabase publishable key in the apikey header authenticates the caller.
import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request): boolean {
  const expected = [
    process.env["SUPABASE_ANON_KEY"],
    process.env["SUPABASE_PUBLISHABLE_KEY"],
  ].filter((v): v is string => Boolean(v));
  if (expected.length === 0) return false;
  const provided =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer /i, "") ??
    "";
  return expected.includes(provided);
}

export const Route = createFileRoute("/api/public/publishing/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { runDuePublishing, refreshExpiringTokens } = await import("@/lib/job-runner.server");
        try {
          const [publishing, tokens] = await Promise.all([
            runDuePublishing(10, "cron"),
            refreshExpiringTokens(15),
          ]);
          return Response.json({ ok: true, publishing, tokens });
        } catch (cause) {
          console.error("[runner] cron run failed", cause);
          return new Response(JSON.stringify({ ok: false, error: "Runner failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
