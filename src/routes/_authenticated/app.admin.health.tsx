import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, RefreshCw, Webhook, Repeat } from "lucide-react";
import {
  getMyRoles,
  listPlatformHealth,
  runPlatformHealthCheck,
  updatePlatformHealthThresholds,
} from "@/lib/admin.functions";
import type { AppRole, PlatformHealth } from "@/lib/admin-types";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin/health")({
  head: () => ({
    meta: [
      { title: "Integration health — PostFlow admin" },
      {
        name: "description",
        content:
          "Per-platform sync status, last webhook and poll runs, failure counts and alert thresholds for permissions that are about to expire.",
      },
      { property: "og:title", content: "Integration health — PostFlow admin" },
      {
        property: "og:description",
        content: "Automatic health checks across every connected publishing platform.",
      },
    ],
  }),
  component: AdminHealthPage,
});

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function AdminHealthPage() {
  const queryClient = useQueryClient();
  const fetchHealth = useServerFn(listPlatformHealth);
  const fetchRoles = useServerFn(getMyRoles);
  const doCheck = useServerFn(runPlatformHealthCheck);
  const doThresholds = useServerFn(updatePlatformHealthThresholds);

  const { data: myRoles } = useQuery<AppRole[]>({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  const canWrite = myRoles?.includes("admin") ?? false;

  const { data: rows = [], isLoading } = useQuery<PlatformHealth[]>({
    queryKey: ["platform-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["platform-health"] });

  const checkMutation = useMutation({
    mutationFn: (platform: string) => doCheck({ data: { platform } }),
    onSuccess: () => {
      toast.success("Health check finished.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Health check failed."),
  });

  const thresholdMutation = useMutation({
    mutationFn: (vars: {
      platform: string;
      failureAlertThreshold: number;
      staleSyncAlertMinutes: number;
      permissionExpiryAlertDays: number;
    }) => doThresholds({ data: vars }),
    onSuccess: () => {
      toast.success("Alert thresholds saved.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const alerting = rows.filter((r) => r.alerts.length > 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Running health checks…</p>;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-2xl p-5",
          alerting.length > 0 ? "surface-strong" : "border border-border",
        )}
      >
        <p className="flex items-center gap-2 text-sm font-bold">
          {alerting.length > 0 ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : (
            <Activity className="size-4" aria-hidden />
          )}
          {alerting.length > 0
            ? `${alerting.length} platform${alerting.length === 1 ? "" : "s"} need attention`
            : "All platform integrations are within their alert thresholds"}
        </p>
        {alerting.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {alerting.map((r) => (
              <li key={r.platform}>
                <strong>{platformMap[r.platform as SocialPlatform]?.name ?? r.platform}:</strong>{" "}
                {r.alerts[0]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <HealthCard
            key={row.platform}
            row={row}
            canWrite={canWrite}
            checking={checkMutation.isPending && checkMutation.variables === row.platform}
            onCheck={() => checkMutation.mutate(row.platform)}
            saving={thresholdMutation.isPending}
            onSaveThresholds={(vars) =>
              thresholdMutation.mutate({ platform: row.platform, ...vars })
            }
          />
        ))}
      </div>
    </div>
  );
}

function HealthCard({
  row,
  canWrite,
  checking,
  onCheck,
  saving,
  onSaveThresholds,
}: {
  row: PlatformHealth;
  canWrite: boolean;
  checking: boolean;
  onCheck: () => void;
  saving: boolean;
  onSaveThresholds: (vars: {
    failureAlertThreshold: number;
    staleSyncAlertMinutes: number;
    permissionExpiryAlertDays: number;
  }) => void;
}) {
  const meta = platformMap[row.platform as SocialPlatform];
  const [failures, setFailures] = useState(String(row.failure_alert_threshold));
  const [stale, setStale] = useState(String(row.stale_sync_alert_minutes));
  const [expiry, setExpiry] = useState(String(row.permission_expiry_alert_days));

  useEffect(() => {
    setFailures(String(row.failure_alert_threshold));
    setStale(String(row.stale_sync_alert_minutes));
    setExpiry(String(row.permission_expiry_alert_days));
  }, [row.failure_alert_threshold, row.stale_sync_alert_minutes, row.permission_expiry_alert_days]);

  const dirty =
    failures !== String(row.failure_alert_threshold) ||
    stale !== String(row.stale_sync_alert_minutes) ||
    expiry !== String(row.permission_expiry_alert_days);

  return (
    <article className="space-y-4 rounded-2xl border border-border p-5">
      <header className="flex flex-wrap items-center gap-3">
        {meta && (
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <meta.icon className="size-5" aria-hidden />
          </span>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{meta?.name ?? row.platform}</h2>
          <p className="text-xs text-muted-foreground">
            Checked {relative(row.checked_at)} · {row.connectedAccounts} connected account
            {row.connectedAccounts === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            row.sync_status === "healthy" && "bg-primary text-primary-foreground",
            row.sync_status === "degraded" && "hatch border border-primary/50",
            row.sync_status === "failing" && "border border-dashed border-primary/60",
            row.sync_status === "unknown" && "border border-border",
          )}
        >
          {row.sync_status}
        </span>
      </header>

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1 text-muted-foreground">
            <Webhook className="size-3.5" aria-hidden /> Last webhook
          </dt>
          <dd className="font-semibold">{relative(row.last_webhook_at)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-muted-foreground">
            <Repeat className="size-3.5" aria-hidden /> Last poll
          </dt>
          <dd className="font-semibold">{relative(row.last_poll_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last success</dt>
          <dd className="font-semibold">{relative(row.last_success_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Consecutive failures</dt>
          <dd className="font-semibold tabular-nums">{row.consecutive_failures}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Permissions expiring soon</dt>
          <dd className="font-semibold tabular-nums">{row.expiringAccounts}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Permissions expired</dt>
          <dd className="font-semibold tabular-nums">{row.expiredAccounts}</dd>
        </div>
      </dl>

      {row.last_error_message && (
        <p className="rounded-md border border-dashed border-primary/60 p-3 text-xs">
          {row.last_error_message}
        </p>
      )}

      {row.alerts.length > 0 && (
        <ul className="space-y-1 text-xs">
          {row.alerts.map((alert) => (
            <li key={alert} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {alert}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <label className="block text-xs font-semibold">
          Failure alert at
          <input
            type="number"
            min={1}
            max={100}
            disabled={!canWrite}
            value={failures}
            onChange={(e) => setFailures(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold">
          Stale sync (min)
          <input
            type="number"
            min={5}
            max={10080}
            disabled={!canWrite}
            value={stale}
            onChange={(e) => setStale(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold">
          Expiry warning (days)
          <input
            type="number"
            min={1}
            max={90}
            disabled={!canWrite}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={checking}
            onClick={onCheck}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", checking && "animate-spin")} aria-hidden />
            {checking ? "Checking…" : "Run health check"}
          </button>
          <button
            disabled={saving || !dirty}
            onClick={() =>
              onSaveThresholds({
                failureAlertThreshold: Number(failures),
                staleSyncAlertMinutes: Number(stale),
                permissionExpiryAlertDays: Number(expiry),
              })
            }
            className="rounded-md border border-dashed border-primary/60 px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"
          >
            {dirty ? "Save thresholds" : "Thresholds saved"}
          </button>
        </div>
      )}
    </article>
  );
}
