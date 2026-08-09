import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SocialConnection } from "@/lib/social-platforms";

export type DashboardJob = {
  id: string;
  platform: string;
  postTitle: string;
  status: string;
  scheduledFor: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

export type DashboardData = {
  connections: SocialConnection[];
  needsReconnect: number;
  counts: { queued: number; running: number; succeeded: number; failed: number; cancelled: number };
  publishedThisMonth: number;
  upcoming: DashboardJob[];
  recent: DashboardJob[];
};

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { listConnectionsForUser } = await import("@/lib/social-connections.server");
    const connections = await listConnectionsForUser(context.userId);

    const { data, error } = await context.supabase
      .from("publish_jobs")
      .select(
        "id, platform, post_title, status, scheduled_for, finished_at, created_at, error_message",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const jobs: DashboardJob[] = (data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      postTitle: row.post_title,
      status: row.status,
      scheduledFor: row.scheduled_for,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
      errorMessage: row.error_message,
    }));

    const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
    for (const job of jobs) {
      if (job.status in counts) counts[job.status as keyof typeof counts] += 1;
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    return {
      connections,
      needsReconnect: connections.filter((c) => c.status !== "connected").length,
      counts,
      publishedThisMonth: jobs.filter(
        (j) =>
          j.status === "succeeded" &&
          new Date(j.finishedAt ?? j.createdAt).getTime() >= monthStart.getTime(),
      ).length,
      upcoming: jobs
        .filter((j) => j.status === "queued" || j.status === "running")
        .sort(
          (a, b) =>
            new Date(a.scheduledFor ?? a.createdAt).getTime() -
            new Date(b.scheduledFor ?? b.createdAt).getTime(),
        )
        .slice(0, 6),
      recent: jobs.slice(0, 6),
    };
  });
