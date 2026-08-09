import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Ban, ChevronDown, Timer } from "lucide-react";
import {
  cancelJob,
  getMyRoles,
  listJobs,
  retryJob,
  retryJobWithBackoff,
} from "@/lib/admin.functions";
// The inspector pulls in the timeline + JSON diff table; it is only mounted when
// an admin expands a row, so it must not ship in the route's initial chunk.
const JobInspector = lazy(() =>
  import("@/components/admin/JobInspector").then((m) => ({ default: m.JobInspector })),
);
import { JOB_STATUSES, type AppRole, type PublishJob } from "@/lib/admin-types";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin/jobs")({
  head: () => ({
    meta: [
      { title: "Failed job inspection — PostFlow admin" },
      {
        name: "description",
        content: "Inspect failed publish jobs with provider error codes, raw responses and attempt history, then requeue or cancel them.",
      },
      { property: "og:title", content: "Failed job inspection — PostFlow admin" },
      { property: "og:description", content: "Diagnose and requeue failed PostFlow publish jobs." },
    ],
  }),
  component: AdminJobsPage,
});

const platformKeys = Object.keys(platformMap) as SocialPlatform[];

function AdminJobsPage() {
  const queryClient = useQueryClient();
  const fetchJobs = useServerFn(listJobs);
  const fetchRoles = useServerFn(getMyRoles);
  const doRetry = useServerFn(retryJob);
  const doCancel = useServerFn(cancelJob);
  const doBackoff = useServerFn(retryJobWithBackoff);
  const [status, setStatus] = useState<string>("failed");
  const [platform, setPlatform] = useState<string>("all");
  const [openJob, setOpenJob] = useState<string | null>(null);

  const { data: myRoles } = useQuery<AppRole[]>({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  const canWrite = myRoles?.includes("admin") ?? false;

  const { data: jobs = [], isLoading } = useQuery<PublishJob[]>({
    queryKey: ["admin-jobs", status, platform],
    queryFn: () => fetchJobs({ data: { status, platform } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => doRetry({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job requeued.");
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Retry failed."),
  });

  const backoffMutation = useMutation({
    mutationFn: (jobId: string) => doBackoff({ data: { jobId } }),
    onSuccess: (result) => {
      toast.success(
        `Retry scheduled in ${result.delaySeconds}s (at ${new Date(result.nextRetryAt).toLocaleTimeString()}).`,
      );
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["admin-job-detail"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not schedule the retry."),
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => doCancel({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job cancelled.");
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Cancel failed."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="text-sm">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Filter by platform</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="all">All platforms</option>
            {platformKeys.map((p) => (
              <option key={p} value={p}>
                {platformMap[p].name}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto self-center text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {!isLoading && jobs.length === 0 && (
        <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
          No jobs match this filter. Publish jobs are recorded here whenever a post is sent to a
          platform.
        </p>
      )}

      <ul className="space-y-3">
        {jobs.map((job) => {
          const meta = platformMap[job.platform as SocialPlatform];
          const expanded = openJob === job.id;
          const busy =
            (retryMutation.isPending && retryMutation.variables === job.id) ||
            (cancelMutation.isPending && cancelMutation.variables === job.id) ||
            (backoffMutation.isPending && backoffMutation.variables === job.id);
          return (
            <li key={job.id} className="rounded-2xl border border-border">
              <div className="flex flex-wrap items-center gap-3 p-4">
                {meta && (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <meta.icon className="size-4" aria-hidden />
                  </span>
                )}
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold">{job.post_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta?.name ?? job.platform} · attempt {job.attempt_count}/{job.max_attempts} ·{" "}
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    job.status === "succeeded" && "bg-primary text-primary-foreground",
                    job.status === "failed" && "border border-dashed border-primary/60",
                    (job.status === "queued" || job.status === "running") &&
                      "hatch border border-primary/50",
                    job.status === "cancelled" && "border border-border",
                  )}
                >
                  {job.status}
                </span>
                <button
                  onClick={() => setOpenJob(expanded ? null : job.id)}
                  aria-expanded={expanded}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
                >
                  Details
                  <ChevronDown className={cn("size-3.5", expanded && "rotate-180")} aria-hidden />
                </button>
                {canWrite && (
                  <>
                    <button
                      disabled={busy || (job.status !== "failed" && job.status !== "cancelled")}
                      onClick={() => retryMutation.mutate(job.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Requeue
                    </button>
                    <button
                      disabled={busy || (job.status !== "failed" && job.status !== "cancelled")}
                      onClick={() => backoffMutation.mutate(job.id)}
                      title="Schedule the next attempt with exponential backoff"
                      className="inline-flex items-center gap-1 rounded-md border border-primary px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <Timer className="size-3.5" aria-hidden />
                      Retry with backoff
                    </button>
                    <button
                      disabled={busy || job.status === "succeeded" || job.status === "cancelled"}
                      onClick={() => cancelMutation.mutate(job.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <Ban className="size-3.5" aria-hidden />
                      Cancel
                    </button>
                  </>
                )}
              </div>

              {expanded && (
                <div className="space-y-3 border-t border-border p-4 text-xs">
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Job ID</dt>
                      <dd className="break-all font-medium">{job.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Owner</dt>
                      <dd className="break-all font-medium">{job.user_id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Error code</dt>
                      <dd className="font-medium">{job.error_code ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="font-medium">
                        {job.duration_ms == null ? "—" : `${job.duration_ms} ms`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Scheduled for</dt>
                      <dd className="font-medium">
                        {job.scheduled_for ? new Date(job.scheduled_for).toLocaleString() : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Started</dt>
                      <dd className="font-medium">
                        {job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next retry</dt>
                      <dd className="font-medium">
                        {job.next_retry_at ? new Date(job.next_retry_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Finished</dt>
                      <dd className="font-medium">
                        {job.finished_at ? new Date(job.finished_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                  </dl>

                  {job.error_message && (
                    <div>
                      <p className="font-semibold">Error message</p>
                      <p className="mt-1 rounded-md border border-border p-3">{job.error_message}</p>
                    </div>
                  )}

                  {job.provider_response && (
                    <div>
                      <p className="font-semibold">Raw provider response</p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-border p-3">
                        {job.provider_response}
                      </pre>
                    </div>
                  )}

                  <div className="border-t border-border pt-3">
                    <Suspense
                      fallback={<p className="text-xs text-muted-foreground">Loading timeline…</p>}
                    >
                      <JobInspector jobId={job.id} />
                    </Suspense>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
