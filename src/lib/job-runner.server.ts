// Worker loop: claims due destinations with row locking and runs them.
import { processJobDestination, pollProcessingDestination } from "@/lib/publishing.server";
import type { DestinationStatus } from "@/lib/publishing-types";

export type RunnerReport = {
  claimed: number;
  results: Record<string, number>;
  recovered: number;
};

/**
 * Claims up to `limit` due destinations via FOR UPDATE SKIP LOCKED, so several
 * concurrent runners never publish the same destination twice.
 */
export async function runDuePublishing(limit = 10, worker = "tss-runner"): Promise<RunnerReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Fail anything that has been in-flight far too long before claiming, so a
  // dead worker can never leave a destination stuck on Queued/Uploading.
  let recovered = 0;
  {
    const { data: swept, error: sweepError } = await supabaseAdmin.rpc(
      "recover_stuck_publishing_destinations",
    );
    if (sweepError) console.error("[PUBLISH_SWEEP_FAILED]", sweepError.message);
    else recovered = Number(swept ?? 0);
  }
  const { data, error } = await supabaseAdmin.rpc("claim_due_publishing_destinations", {
    _limit: limit,
    _worker: worker,
  });
  if (error) throw error;

  const claimed = data ?? [];
  const results: Record<string, number> = {};
  // Destinations are independent. Start them together so a large YouTube video
  // cannot leave Instagram/Facebook/Snapchat waiting behind it in the queue.
  await Promise.all(
    claimed.map(async (row) => {
      console.info(
        "[PUBLISH_JOB_CLAIMED]",
        JSON.stringify({
          job_id: row.publishing_job_id,
          job_destination_id: row.id,
          platform: row.platform,
          attempt: (row.attempt_count ?? 0) + 1,
          worker,
        }),
      );
      let status: DestinationStatus;
      try {
        status =
          row.status === "processing"
            ? await pollProcessingDestination(row.id)
            : await processJobDestination(row.id);
      } catch (cause) {
        console.error("[runner] destination failed hard", row.id, cause);
        status = "failed";
      }
      console.info(
        "[PUBLISH_JOB_COMPLETED]",
        JSON.stringify({ job_destination_id: row.id, platform: row.platform, status }),
      );
      results[status] = (results[status] ?? 0) + 1;
    }),
  );
  return { claimed: claimed.length, results, recovered };
}

/** Refreshes tokens that are close to expiring, independent of publishing. */
export async function refreshExpiringTokens(limit = 25): Promise<{ checked: number; refreshed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureFreshToken } = await import("@/lib/token-refresh.server");
  const soon = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("social_connections")
    .select("id")
    .not("token_expires_at", "is", null)
    .lte("token_expires_at", soon)
    .neq("connection_status", "disconnected")
    .limit(limit);

  let refreshed = 0;
  for (const row of data ?? []) {
    const outcome = await ensureFreshToken(row.id);
    if (outcome.ok && outcome.refreshed) refreshed += 1;
  }
  return { checked: (data ?? []).length, refreshed };
}
