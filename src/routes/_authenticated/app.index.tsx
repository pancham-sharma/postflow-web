import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Link2,
  PlusCircle,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { getDashboardSummary } from "@/lib/dashboard-summary.functions";
import { dashboardKeys, storageKeys } from "@/lib/query-keys";
import { formatBytes } from "@/lib/format";
import { useJobRealtime } from "@/hooks/use-job-realtime";
import { startPlatformConnect } from "@/lib/social-connections.functions";
import { platformMap, platforms } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — PostFlow" },
      { name: "description", content: "Live publishing overview: connected accounts, scheduled posts, published results and failures." },
      { property: "og:title", content: "Dashboard — PostFlow" },
      { property: "og:description", content: "Track scheduled, published and failed posts across every connected account." },
    ],
  }),
  component: Dashboard,
});

function when(value: string | null, fallback: string) {
  if (!value) return fallback;
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Dashboard() {
  const queryClient = useQueryClient();
  const fetchDashboard = useServerFn(getDashboardData);
  const startConnect = useServerFn(startPlatformConnect);
  const [pending, setPending] = useState<string | null>(null);

  const fetchSummary = useServerFn(getDashboardSummary);
  const live = useJobRealtime([["dashboard"], ["dashboard-summary"]]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: dashboardKeys.legacy(),
    queryFn: () => fetchDashboard(),
    // Websocket pushes changes instantly; polling is only a slow safety net and
    // never runs while the tab is in the background.
    refetchInterval: live ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  // Workspace-scoped totals (accounts, posts by status, media, storage).
  const { data: summary } = useQuery({
    queryKey: storageKeys.usage(),
    queryFn: () => fetchSummary(),
    refetchInterval: live ? false : 60_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });


  // Surface the OAuth round-trip outcome when the provider sends the user back here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected") ?? params.get("platform");
    const outcome = params.get("oauth");
    const error = params.get("connect_error");
    if (!connected && !error) return;
    if (connected && outcome !== "failed") {
      toast.success(
        `${platformMap[connected as SocialPlatform]?.name ?? connected} account connected successfully.`,
      );
      // Refresh both the counts card and the connected-accounts list.
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: storageKeys.usage() });
    }
    if (error) toast.error(error);
    window.history.replaceState({}, "", window.location.pathname);
  }, [queryClient]);

  async function connect(platform: SocialPlatform) {
    setPending(platform);
    try {
      const { authorizeUrl, connectUrl } = (await startConnect({
        data: { platform, origin: window.location.origin },
      })) as { authorizeUrl: string; connectUrl?: string };
      // Same-origin backend entry point that 302s to the provider.
      const target = connectUrl ?? authorizeUrl;
      if (window.top && window.top !== window.self) {
        const opened = window.open(target, "_blank", "noopener,noreferrer");
        if (!opened) toast.error("Allow pop-ups to finish connecting, then try again.");
        else toast.info("Finish authorizing in the new tab, then return here.");
        setPending(null);
        return;
      }
      window.location.assign(target);
    } catch (error) {
      setPending(null);
      toast.error(error instanceof Error ? error.message : "Could not start authorization.");
    }
  }

  const connections = data?.connections ?? [];
  const counts = data?.counts ?? { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };

  // Derived lists are memoized so the card grid and connect grid are only
  // rebuilt when the underlying dashboard payload actually changes.
  // Every platform stays connectable: a healthy link can still add another
  // account, and an expiring/expired one needs a fresh authorization.
  const available = useMemo(() => {
    const connectedKeys = new Set(connections.map((c) => c.platform));
    return platforms.map((p) => ({
      ...p,
      alreadyConnected: connectedKeys.has(p.key as SocialPlatform),
    }));
  }, [connections]);


  const cards = useMemo(
    () => [
      {
        label: "Connected accounts",
        value: summary?.connectedAccounts ?? connections.length,
        sub: summary?.needsReconnect
          ? `${summary.needsReconnect} need reconnecting`
          : connections.length === 0
            ? "Connect your first account"
            : "All healthy",
        icon: Link2,
        strong: false,
      },
      {
        label: "Scheduled posts",
        value: summary?.scheduledPosts ?? counts.queued,
        sub: data?.upcoming[0]
          ? `Next ${when(data.upcoming[0].scheduledFor, "unscheduled")}`
          : "Nothing queued",
        icon: CalendarDays,
        strong: true,
      },
      {
        label: "Published posts",
        value: summary?.publishedPosts ?? 0,
        sub: `${data?.publishedThisMonth ?? 0} this month`,
        icon: Upload,
        strong: false,
      },
      {
        label: "Failed posts",
        value: summary?.failedPosts ?? counts.failed,
        sub:
          (summary?.postsNeedingAttention ?? 0) > 0
            ? `${summary?.postsNeedingAttention} need attention`
            : (summary?.failedPosts ?? counts.failed)
              ? "Retry available"
              : "No failures",
        icon: TriangleAlert,
        strong: true,
      },
      {
        label: "Media uploaded",
        value: summary?.uploadedMedia ?? 0,
        sub: `${formatBytes(summary?.storageUsedBytes ?? 0)} of ${formatBytes(
          summary?.storageLimitBytes ?? 10 * 1024 ** 3,
        )} used`,
        icon: Upload,
        strong: false,
      },

      {
        label: "Running now",
        value: counts.running,
        sub: `${counts.succeeded} succeeded all-time`,
        icon: CheckCircle2,
        strong: false,
      },
    ],
    [connections.length, counts.queued, counts.failed, counts.running, counts.succeeded, data, summary],
  );


  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? "Loading your live data…"
              : live
                ? "Live — job updates stream in instantly"
                : "Live data from your account · refreshes every 15s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold">
            <span
              className={`size-2 rounded-full bg-primary ${live ? "animate-pulse" : "opacity-40"}`}
              aria-hidden
            />
            {live ? "Live" : "Offline"}
          </span>
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-md border border-primary/50 px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <article
            key={c.label}
            className={`rounded-2xl p-5 ${c.strong ? "surface-strong" : "surface-light"}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{c.label}</p>
              <c.icon className="size-4.5 opacity-80" aria-hidden />
            </div>
            <p className="mt-4 text-3xl font-bold">{isLoading ? "—" : c.value}</p>
            <p className="mt-1 text-xs opacity-75">{c.sub}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Upcoming posts</h2>
            <Link to="/app/calendar" className="text-sm font-medium underline underline-offset-4">
              Open calendar
            </Link>
          </div>
          {!isLoading && (data?.upcoming.length ?? 0) === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
              No posts queued yet.{" "}
              <Link to="/app/create" className="underline underline-offset-4">
                Create your first post
              </Link>{" "}
              and it will appear here instantly.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(data?.upcoming ?? []).map((job) => {
                const platform = platformMap[job.platform as SocialPlatform];
                const Icon = platform?.icon ?? Upload;
                return (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{job.postTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {platform?.name ?? job.platform} · {when(job.scheduledFor, "not scheduled")}
                      </p>
                    </div>
                    <span className="rounded-full border border-primary/50 px-2.5 py-1 text-xs font-semibold">
                      {job.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { to: "/app/media", label: "Upload media", icon: Upload, search: { upload: "1" } },
                { to: "/app/create", label: "Create post", icon: PlusCircle, search: undefined },
                { to: "/app/accounts", label: "Manage accounts", icon: Link2, search: undefined },
                { to: "/app/calendar", label: "Open calendar", icon: CalendarDays, search: undefined },
              ].map((a) => (
                <Link
                  key={a.to + a.label}
                  to={a.to}
                  {...(a.search ? { search: a.search } : {})}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-sm font-medium hover:bg-accent"
                >
                  <a.icon className="size-4" aria-hidden />
                  {a.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-lg font-semibold">Connect an account</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Authorize a platform to start publishing. Tokens are encrypted; we never see your
              password.
            </p>
            <div className="mt-4 space-y-2">
              {connections.map((c) => {
                const platform = platformMap[c.platform];
                const Icon = platform?.icon ?? Link2;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.accountName}</span>
                    {c.status === "connected" ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Connected
                      </span>
                    ) : (
                      <button
                        disabled={pending === c.platform}
                        onClick={() => connect(c.platform)}
                        className="rounded-md border border-primary/60 px-2 py-1 text-xs font-semibold hover:bg-accent disabled:opacity-60"
                      >
                        {pending === c.platform
                          ? "Redirecting…"
                          : `${c.status === "expired" ? "Reconnect" : "Renew"} ${platform?.name ?? ""}`}
                      </button>
                    )}
                  </div>
                );
              })}
              {available.map((p) => (
                <button
                  key={p.key}
                  disabled={pending === p.key}
                  onClick={() => connect(p.key as SocialPlatform)}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/60 px-3 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
                >
                  <p.icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-left">
                    {pending === p.key
                      ? "Redirecting…"
                      : p.alreadyConnected
                        ? `Connect another ${p.name} account`
                        : `Connect ${p.name}`}
                  </span>
                </button>
              ))}
            </div>
          </section>


          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            {!isLoading && (data?.recent.length ?? 0) === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing yet — activity appears as soon as you publish or schedule a post.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {(data?.recent ?? []).map((job) => (
                  <li key={job.id} className="flex gap-3 text-sm">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate">
                        {job.postTitle} — {job.status}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {when(job.finishedAt ?? job.createdAt, "just now")}
                        {job.errorMessage ? ` · ${job.errorMessage}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
