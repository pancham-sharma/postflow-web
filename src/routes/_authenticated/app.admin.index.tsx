import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/admin.functions";
import type { AdminOverview } from "@/lib/admin-types";

export const Route = createFileRoute("/_authenticated/app/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview — PostFlow" },
      {
        name: "description",
        content: "Live counts of users, queued and failed publish jobs, success rate and paused platform integrations.",
      },
      { property: "og:title", content: "Admin overview — PostFlow" },
      { property: "og:description", content: "Operational health of the PostFlow publishing queue." },
    ],
  }),
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading metrics…</p>;
  if (error) {
    return (
      <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm">
        {error instanceof Error ? error.message : "Could not load metrics."}
      </p>
    );
  }
  if (!data) return null;

  const cards = [
    { label: "Accounts", value: data.totalUsers, hint: "Registered users" },
    { label: "Failed jobs", value: data.failedJobs, hint: "Awaiting inspection", strong: true },
    { label: "Queued", value: data.queuedJobs, hint: "Waiting for a worker" },
    { label: "Running", value: data.runningJobs, hint: "In flight now" },
    { label: "Jobs · 24h", value: data.jobsLast24h, hint: "Created in last day" },
    {
      label: "Success rate",
      value: data.successRate === null ? "—" : `${data.successRate}%`,
      hint: "Settled jobs, 24h",
    },
    { label: "Paused platforms", value: data.platformsDisabled, hint: "Disabled or maintenance" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <article
            key={c.label}
            className={
              c.strong
                ? "surface-strong rounded-2xl p-5"
                : "rounded-2xl border border-border p-5"
            }
          >
            <p className={c.strong ? "text-xs font-semibold opacity-85" : "text-xs font-semibold text-muted-foreground"}>
              {c.label}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{c.value}</p>
            <p className={c.strong ? "mt-1 text-xs opacity-85" : "mt-1 text-xs text-muted-foreground"}>
              {c.hint}
            </p>
          </article>
        ))}
      </div>

      <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
        Metrics refresh every 30 seconds. Every value is read server-side under your role — support
        accounts see the same counters but cannot change anything.
      </p>
    </div>
  );
}
