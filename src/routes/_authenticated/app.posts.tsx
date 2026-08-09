import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cancelPostSchedule, deletePost, listPosts } from "@/lib/content.functions";
import {
  listDestinationAttempts,
  retryDestination,
  runDuePublishingForMe,
} from "@/lib/publishing.functions";
import {
  DESTINATION_STATUS_LABEL,
  POST_STATUS_LABEL,
  type PostStatus,
} from "@/lib/publishing-types";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import { DestinationFailureCard } from "@/components/publishing/destination-failure-card";
import { SnapchatShareCard } from "@/components/publishing/snapchat-share-card";
import { classifyProviderError } from "@/lib/provider-error-map";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useJobRealtime } from "@/hooks/use-job-realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/posts")({
  head: () => ({
    meta: [
      { title: "Post History — PostFlow" },
      { name: "description", content: "Drafts, scheduled, published, partially published and failed posts with per-platform publishing results." },
      { property: "og:title", content: "Post History — PostFlow" },
      { property: "og:description", content: "Inspect every publishing result and retry failed platforms individually." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostHistory,
});

const tabs: { label: string; status?: PostStatus }[] = [
  { label: "All" },
  { label: "Draft", status: "draft" },
  { label: "Scheduled", status: "queued" },
  { label: "Publishing", status: "publishing" },
  { label: "Published", status: "published" },
  { label: "Partially published", status: "partially_published" },
  { label: "Failed", status: "failed" },
];

const PAGE_SIZE = 20;

function PostHistory() {
  const queryClient = useQueryClient();
  const fetchPosts = useServerFn(listPosts);
  const retry = useServerFn(retryDestination);
  const cancel = useServerFn(cancelPostSchedule);
  const remove = useServerFn(deletePost);

  const [tab, setTab] = useState("All");
  const [platform, setPlatform] = useState("all");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const search = useDebouncedValue(term, 300);
  const live = useJobRealtime([["post-history"], ["dashboard-summary"], ["dashboard"]]);

  const status = useMemo(() => tabs.find((t) => t.label === tab)?.status ?? null, [tab]);

  const query = useQuery({
    queryKey: ["post-history", status, platform, search, page],
    queryFn: () =>
      fetchPosts({
        data: {
          status,
          platform: platform === "all" ? null : platform,
          search,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const rows = query.data?.posts ?? [];
  const total = query.data?.total ?? 0;

  const invalidate = useCallback(() => {
    for (const queryKey of [["post-history"], ["post-calendar"], ["calendar"], ["dashboard"], ["dashboard-summary"]]) {
      void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
    }
  }, [queryClient]);

  // Anything still waiting means the one-shot dispatch never ran (navigation
  // aborted it, tab closed, transient error). Nudge the server to pick it up.
  const pendingCount = rows.reduce(
    (n, p) =>
      n +
      p.destinations.filter((d) =>
        [
          "pending",
          "queued",
          "validating",
          "uploading",
          "processing",
          "retry_scheduled",
          "rate_limited",
        ].includes(d.status),
      ).length,
    0,
  );
  const kick = useServerFn(runDuePublishingForMe);
  const kicking = useRef(false);

  useEffect(() => {
    if (pendingCount === 0) return;
    let cancelled = false;

    const run = async () => {
      if (kicking.current || document.visibilityState !== "visible") return;
      kicking.current = true;
      try {
        const result = await kick({});
        if (!cancelled && result?.processed) invalidate();
      } catch {
        // Silent: the cron runner is the ultimate backstop.
      } finally {
        kicking.current = false;
      }
    };

    void run();
    const timer = setInterval(() => void run(), 20_000);
    // Realtime normally delivers status changes. Poll quickly only while its
    // websocket is unavailable and a destination is still in flight.
    const poll = setInterval(() => {
      if (!live && document.visibilityState === "visible") invalidate();
    }, 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [pendingCount, kick, invalidate, live]);

  const retryMutation = useMutation({
    mutationFn: async (input: string | { destinationId: string; originalAudioOnly?: boolean }) =>
      retry({
        data:
          typeof input === "string"
            ? { destinationId: input }
            : { destinationId: input.destinationId, originalAudioOnly: input.originalAudioOnly ?? false },
      }),
    onSuccess: (result) => {
      const status = result?.status;
      if (status === "published") toast.success("Retry succeeded — the post is live.");
      else if (status === "processing" || status === "uploading")
        toast.success("Re-uploading now — status updates live.");
      else if (status === "reconnect_required")
        toast.error(
          result?.errorMessage ?? "That account's authorization expired. Reconnect it, then retry.",
        );
      else if (status === "retry_scheduled" || status === "rate_limited")
        toast.message(result?.errorMessage ?? "The platform is busy — a retry is scheduled.");
      else if (status === "failed") {
        const classified = classifyProviderError({
          code: result?.errorCode ?? null,
          message: result?.errorMessage ?? null,
        });
        toast.error(result?.errorMessage ?? classified.reason, {
          description: `This is not retryable. ${classified.reason}`,
        });
      } else toast.success("Retry started for that platform.");
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["destination-attempts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (postId: string) => cancel({ data: { postId } }),
    onSuccess: () => {
      toast.success("Schedule cancelled.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (postId: string) => remove({ data: { postId } }),
    onSuccess: () => {
      toast.success("Post deleted.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryVariables = retryMutation.variables;
  const retryingId = retryMutation.isPending
    ? typeof retryVariables === "string"
      ? retryVariables
      : (retryVariables?.destinationId ?? null)
    : null;

  const onRetry = useCallback(
    (destinationId: string, originalAudioOnly?: boolean) =>
      retryMutation.mutate(
        originalAudioOnly ? { destinationId, originalAudioOnly: true } : destinationId,
      ),
    [retryMutation],
  );
  const onCancel = useCallback((postId: string) => cancelMutation.mutate(postId), [cancelMutation]);
  const onDelete = useCallback((postId: string) => deleteMutation.mutate(postId), [deleteMutation]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Post history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every post keeps an independent result for each selected platform.
          </p>
          <p className="mt-1 text-xs font-semibold text-primary">
            {live ? "Live upload status connected" : "Connecting live upload status…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" aria-hidden />
            <input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
              }}
              placeholder="Search title or caption"
              aria-label="Search posts"
              className="w-full min-w-0 rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none sm:w-60"
            />
          </div>
          <select
            aria-label="Filter by platform"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold"
          >
            <option value="all">All platforms</option>
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setTab(t.label);
              setPage(0);
            }}
            aria-pressed={tab === t.label}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              tab === t.label ? "bg-primary text-primary-foreground" : "border border-primary/40 hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-8 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your posts…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-dashed border-primary/60 p-6 text-center">
          <p className="font-semibold">Could not load post history.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mesh-vanilla rounded-2xl border border-dashed border-primary/50 px-6 py-16 text-center">
          <p className="text-base font-semibold">No posts here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish or schedule a post and it will appear in this history.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              retryingId={retryingId}
              onRetry={onRetry}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-primary/50 px-3 py-2 font-semibold hover:bg-accent disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-primary/50 px-3 py-2 font-semibold hover:bg-accent disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

type PostItem = Awaited<ReturnType<typeof listPosts>>["posts"][number];

/** One post card. Memoised so live refetches only re-render changed rows. */
const PostRow = memo(function PostRow({
  post: p,
  retryingId,
  onRetry,
  onCancel,
  onDelete,
}: {
  post: PostItem;
  retryingId: string | null;
  onRetry: (destinationId: string, originalAudioOnly?: boolean) => void;
  onCancel: (postId: string) => void;
  onDelete: (postId: string) => void;
}) {
  return (
    <li
      className="rounded-2xl border border-border p-4"
      style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.title || "Untitled post"}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.caption}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.scheduledAtUtc
              ? `Scheduled ${new Date(p.scheduledAtUtc).toLocaleString()}`
              : `Created ${new Date(p.createdAt).toLocaleString()}`}{" "}
            · {p.mediaCount} file{p.mediaCount === 1 ? "" : "s"} · {p.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold">
            {POST_STATUS_LABEL[p.status] ?? p.status}
          </span>
          {p.scheduledAtUtc && !["published", "publishing"].includes(p.status) && (
            <button
              type="button"
              onClick={() => onCancel(p.id)}
              className="rounded-md border border-primary/50 px-2.5 py-1 text-xs font-semibold hover:bg-accent"
            >
              Cancel schedule
            </button>
          )}
          {["draft", "cancelled", "failed"].includes(p.status) && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this post permanently?")) onDelete(p.id);
              }}
              aria-label="Delete post"
              className="rounded-md border border-dashed border-primary/50 p-1.5 hover:bg-accent"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {p.destinations.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs"
          >
            <span className="font-semibold capitalize">{d.platform}</span>
            {d.accountLabel && <span className="text-muted-foreground">{d.accountLabel}</span>}
            <span className="ml-auto rounded-full border border-primary/40 px-2 py-0.5 font-semibold">
              {DESTINATION_STATUS_LABEL[d.status] ?? d.status}
            </span>
            {d.providerPostUrl && (
              <a
                href={d.providerPostUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                View <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {d.status === "action_required" ||
            (d.platform === "snapchat" && d.errorCode === "snapchat_manual_share_required") ? (
              <SnapchatShareCard destinationId={d.id} />
            ) : ["failed", "reconnect_required", "retry_scheduled", "rate_limited"].includes(
              d.status,
            ) ? (
              <DestinationFailureCard
                failure={{
                  platform: d.platform,
                  status: d.status,
                  errorCode: d.errorCode,
                  errorMessage: d.errorMessage,
                  attemptCount: d.attemptCount,
                  maxAttempts: d.maxAttempts,
                  nextRetryAt: d.nextRetryAt,
                }}
                onRetry={() => onRetry(d.id)}
                onRetryOriginalAudio={() => onRetry(d.id, true)}
                retrying={retryingId === d.id}
              />
            ) : (
              d.errorMessage && (
                <p className="w-full text-[11px] text-muted-foreground">{d.errorMessage}</p>
              )
            )}
            <DestinationAttempts destinationId={d.id} status={d.status} />
          </li>
        ))}
      </ul>
    </li>
  );
});

const ATTEMPT_VISIBLE_FOR = [
  "failed",
  "reconnect_required",
  "retry_scheduled",
  "rate_limited",
  "processing",
  "uploading",
  "published",
];

/** Collapsible attempt-by-attempt upload history for a single destination. */
function DestinationAttempts({ destinationId, status }: { destinationId: string; status: string }) {
  const [open, setOpen] = useState(false);
  const fetchAttempts = useServerFn(listDestinationAttempts);
  const attempts = useQuery({
    queryKey: ["destination-attempts", destinationId],
    queryFn: () => fetchAttempts({ data: { destinationId } }),
    enabled: open,
  });

  if (!ATTEMPT_VISIBLE_FOR.includes(status)) return null;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold underline"
      >
        {open ? "Hide" : "Show"} attempt history
      </button>
      {open && (
        <ol className="mt-2 space-y-1.5 border-l border-border pl-3">
          {attempts.isLoading && <li className="text-[11px] text-muted-foreground">Loading…</li>}
          {!attempts.isLoading && (attempts.data ?? []).length === 0 && (
            <li className="text-[11px] text-muted-foreground">No attempts recorded yet.</li>
          )}
          {(attempts.data ?? []).map((a) => (
            <li key={a.attemptNumber} className="text-[11px] leading-relaxed">
              <span className="font-semibold">
                Attempt {a.attemptNumber} · {DESTINATION_STATUS_LABEL[a.status as never] ?? a.status}
              </span>{" "}
              <span className="text-muted-foreground">
                {new Date(a.createdAt).toLocaleString()}
                {a.durationMs !== null ? ` · ${(a.durationMs / 1000).toFixed(1)}s` : ""}
              </span>
              {a.errorMessage && (
                <p className="text-muted-foreground">
                  {a.errorMessage}
                  {a.errorCode ? ` (${a.errorCode})` : ""}
                </p>
              )}
              {a.nextRetryAt && (
                <p className="text-muted-foreground">
                  Next automatic retry {new Date(a.nextRetryAt).toLocaleString()}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
