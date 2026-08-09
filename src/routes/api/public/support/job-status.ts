import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only job status endpoint for support tools.
 * Authenticates with a scoped admin API key (jobs:read) sent as a bearer token
 * and records the caller's last-used time and IP against that key.
 */
export const Route = createFileRoute("/api/public/support/job-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!presented) {
          return new Response("Missing bearer key", { status: 401 });
        }

        const { verifyApiKey, clientIpFromRequest } = await import("@/lib/api-keys.server");
        const key = await verifyApiKey(presented, "jobs:read", clientIpFromRequest(request));
        if (!key) return new Response("Invalid key or missing scope", { status: 401 });

        const jobId = new URL(request.url).searchParams.get("jobId");
        if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
          return new Response("jobId query parameter must be a UUID", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("publish_jobs")
          .select(
            "id, platform, post_title, status, attempt_count, max_attempts, error_code, next_retry_at, created_at, updated_at",
          )
          .eq("id", jobId)
          .maybeSingle();

        if (!data) return new Response("Job not found", { status: 404 });
        return Response.json({ job: data }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
