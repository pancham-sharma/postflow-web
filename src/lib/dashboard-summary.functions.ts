import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DashboardSummary } from "@/lib/dashboard-summary.server";

export type {
  DashboardSummary,
  DashboardRecentPost,
  DashboardUpcomingPost,
} from "@/lib/dashboard-summary.server";

/** Real, workspace-scoped dashboard + storage aggregates. Zeros for new users. */
export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardSummary> => {
    const { buildDashboardSummary } = await import("@/lib/dashboard-summary.server");
    return buildDashboardSummary(context.supabase, context.userId);
  });
