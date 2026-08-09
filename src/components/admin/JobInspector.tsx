import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleDot, GitCompare, ListTree } from "lucide-react";
import { getJobDetail } from "@/lib/admin.functions";
import type { JobAttempt, JobDetail } from "@/lib/admin-types";
import { diffPayloads, type DiffRow } from "@/lib/json-diff";
import { cn } from "@/lib/utils";

function stamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function attemptLabel(a: JobAttempt): string {
  return `Attempt ${a.attempt_number} · ${a.status}`;
}

/** Timeline of attempts and events plus a payload diff between any two attempts. */
export function JobInspector({ jobId }: { jobId: string }) {
  const fetchDetail = useServerFn(getJobDetail);
  const { data, isLoading, error } = useQuery<JobDetail>({
    queryKey: ["admin-job-detail", jobId],
    queryFn: () => fetchDetail({ data: { jobId } }),
  });

  const attempts = data?.attempts ?? [];
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [hideSame, setHideSame] = useState(true);

  const left = attempts.find((a) => a.id === leftId) ?? attempts[Math.max(attempts.length - 2, 0)];
  const right = attempts.find((a) => a.id === rightId) ?? attempts[attempts.length - 1];

  const rows: DiffRow[] = useMemo(
    () => diffPayloads(left?.request_payload ?? null, right?.request_payload ?? null),
    [left?.request_payload, right?.request_payload],
  );
  const visibleRows = hideSame ? rows.filter((r) => r.kind !== "same") : rows;
  const changedCount = rows.filter((r) => r.kind !== "same").length;

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading job timeline…</p>;
  if (error) {
    return (
      <p className="text-xs">
        {error instanceof Error ? error.message : "Could not load this job's timeline."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h4 className="flex items-center gap-2 text-xs font-bold">
          <ListTree className="size-3.5" aria-hidden />
          Timeline
        </h4>
        {(data?.events.length ?? 0) === 0 && attempts.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No attempt history recorded for this job yet.
          </p>
        ) : (
          <ol className="mt-2 space-y-3 border-l border-border pl-4">
            {(data?.events ?? []).map((event) => (
              <li key={event.id} className="relative">
                <CircleDot
                  className="absolute -left-[1.32rem] top-0.5 size-3 bg-background"
                  aria-hidden
                />
                <p className="text-xs font-semibold">
                  {event.message}
                  {event.attempt_number != null && (
                    <span className="text-muted-foreground"> · attempt {event.attempt_number}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stamp(event.occurred_at)}
                  {event.actor_email ? ` · ${event.actor_email}` : ""} · {event.kind}
                </p>
                {event.detail && (
                  <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-border p-2 text-xs">
                    {event.detail}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {attempts.length > 0 && (
        <section>
          <h4 className="text-xs font-bold">Attempts</h4>
          <ul className="mt-2 space-y-2">
            {attempts.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3 text-xs">
                <p className="font-semibold">{attemptLabel(a)}</p>
                <p className="text-muted-foreground">
                  {stamp(a.started_at)} → {stamp(a.finished_at)}
                  {a.duration_ms != null ? ` · ${a.duration_ms} ms` : ""}
                  {a.backoff_seconds != null ? ` · backoff ${a.backoff_seconds}s` : ""}
                </p>
                {a.error_code && (
                  <p className="mt-1">
                    <strong>{a.error_code}</strong>
                    {a.error_message ? ` — ${a.error_message}` : ""}
                  </p>
                )}
                {a.provider_response && (
                  <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border p-2">
                    {a.provider_response}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {attempts.length > 1 && (
        <section>
          <h4 className="flex items-center gap-2 text-xs font-bold">
            <GitCompare className="size-3.5" aria-hidden />
            Payload diff between retries
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs">
              <span className="sr-only">Baseline attempt</span>
              <select
                value={left?.id ?? ""}
                onChange={(e) => setLeftId(e.target.value)}
                className="rounded-md border border-border bg-transparent px-2 py-1.5 text-xs"
              >
                {attempts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {attemptLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-muted-foreground">vs</span>
            <label className="text-xs">
              <span className="sr-only">Comparison attempt</span>
              <select
                value={right?.id ?? ""}
                onChange={(e) => setRightId(e.target.value)}
                className="rounded-md border border-border bg-transparent px-2 py-1.5 text-xs"
              >
                {attempts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {attemptLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setHideSame((v) => !v)}
              aria-pressed={hideSame}
              className="rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              {hideSame ? "Show unchanged fields" : "Hide unchanged fields"}
            </button>
            <span className="text-xs text-muted-foreground">
              {changedCount} field{changedCount === 1 ? "" : "s"} differ
            </span>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    Field
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    Baseline
                  </th>
                  <th scope="col" className="py-1.5 font-semibold">
                    Comparison
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.path} className="border-b border-border/60 align-top">
                    <th scope="row" className="py-1.5 pr-3 font-mono font-medium">
                      {row.path}
                      <span
                        className={cn(
                          "ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                          row.kind === "changed" && "hatch border border-primary/50",
                          row.kind === "added" && "bg-primary text-primary-foreground",
                          row.kind === "removed" && "border border-dashed border-primary/60",
                          row.kind === "same" && "border border-border",
                        )}
                      >
                        {row.kind}
                      </span>
                    </th>
                    <td className="break-all py-1.5 pr-3 font-mono">{row.before ?? "—"}</td>
                    <td className="break-all py-1.5 font-mono">{row.after ?? "—"}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted-foreground">
                      Payloads are identical between these two attempts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
