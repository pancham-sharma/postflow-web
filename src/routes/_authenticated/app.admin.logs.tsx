import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { listAuditLogs } from "@/lib/admin.functions";
import type { AdminAuditLog } from "@/lib/admin-types";

export const Route = createFileRoute("/_authenticated/app/admin/logs")({
  head: () => ({
    meta: [
      { title: "API access & audit logs — PostFlow admin" },
      {
        name: "description",
        content: "Read the PostFlow admin audit trail and the API endpoints used for OAuth callbacks and scheduled publishing.",
      },
      { property: "og:title", content: "API access & audit logs — PostFlow admin" },
      { property: "og:description", content: "Audit trail of every administrative action, plus API endpoint reference." },
    ],
  }),
  component: AdminLogsPage,
});

const endpoints = [
  {
    method: "GET",
    path: "/api/public/oauth/callback/:platform",
    purpose: "OAuth redirect target for each social platform. Add this URL to the provider console.",
  },
  {
    method: "POST",
    path: "/api/public/hooks/run-scheduled-posts",
    purpose: "Called by the scheduler to publish posts whose scheduled time has arrived.",
  },
];

function AdminLogsPage() {
  const fetchLogs = useServerFn(listAuditLogs);
  const [action, setAction] = useState("");

  const { data: logs = [], isLoading } = useQuery<AdminAuditLog[]>({
    queryKey: ["admin-audit-logs"],
    queryFn: () => fetchLogs(),
  });

  const filtered = logs.filter((l) =>
    action.trim() ? l.action.toLowerCase().includes(action.trim().toLowerCase()) : true,
  );

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">API access</h2>
        <ul className="space-y-2">
          {endpoints.map((ep) => {
            const url = `${origin}${ep.path}`;
            return (
              <li
                key={ep.path}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
              >
                <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  {ep.method}
                </span>
                <code className="break-all text-xs font-semibold">{ep.path}</code>
                <p className="min-w-48 flex-1 text-xs text-muted-foreground">{ep.purpose}</p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    toast.success("Endpoint URL copied.");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
                >
                  <Copy className="size-3.5" aria-hidden />
                  Copy URL
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Audit log</h2>
          <label className="text-sm">
            <span className="sr-only">Filter by action</span>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Filter by action"
              className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading audit trail…</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
            No administrative actions recorded yet. Role changes, suspensions, job retries and
            integration changes all appear here.
          </p>
        )}

        <ul className="space-y-2">
          {filtered.map((log) => (
            <li key={log.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  {log.action}
                </span>
                <p className="text-xs text-muted-foreground">
                  {log.actor_email ?? log.actor_id ?? "system"} ·{" "}
                  {new Date(log.created_at).toLocaleString()}
                </p>
                {log.target_type && (
                  <p className="text-xs text-muted-foreground">
                    target: {log.target_type} {log.target_id ?? ""}
                  </p>
                )}
              </div>
              {log.details && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border p-3 text-xs">
                  {log.details}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
