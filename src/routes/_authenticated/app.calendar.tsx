import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelPostSchedule, listPosts, reschedulePost, type PostRow } from "@/lib/content.functions";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import { POST_STATUS_LABEL } from "@/lib/publishing-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — PostFlow" },
      { name: "description", content: "Month, week, day and list views of every scheduled and published post across your connected platforms." },
      { property: "og:title", content: "Content Calendar — PostFlow" },
      { property: "og:description", content: "Reschedule posts, filter by platform and see publishing outcomes per day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const views = ["Month", "Week", "Day", "List"] as const;
type View = (typeof views)[number];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const localTimezone =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Monday-first weekday index. */
function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const fetchPosts = useServerFn(listPosts);
  const move = useServerFn(reschedulePost);
  const cancel = useServerFn(cancelPostSchedule);

  const [view, setView] = useState<View>("Month");
  const [platform, setPlatform] = useState<string>("all");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "Day") return { start: startOfDay(cursor), days: 1 };
    if (view === "Week") return { start: addDays(cursor, -mondayIndex(cursor)), days: 7 };
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return { start: first, days };
  }, [cursor, view]);

  const query = useQuery({
    queryKey: ["calendar", view, range.start.toISOString(), range.days, platform],
    queryFn: () =>
      fetchPosts({
        data: {
          platform: platform === "all" ? null : platform,
          ...(view === "List"
            ? {}
            : {
                from: range.start.toISOString(),
                to: addDays(range.start, range.days).toISOString(),
              }),
          limit: 200,
        },
      }),
  });

  const posts = query.data?.posts ?? [];

  const byDay = useMemo(() => {
    const map = new Map<string, PostRow[]>();
    for (const post of posts) {
      const when = post.scheduledAtUtc ?? post.createdAt;
      const key = dayKey(new Date(when));
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    return map;
  }, [posts]);

  const cells = useMemo(
    () => Array.from({ length: range.days }, (_, i) => addDays(range.start, i)),
    [range],
  );
  const padCells = useMemo(
    () => (view === "Month" ? Array.from({ length: mondayIndex(range.start) }, (_, i) => i) : []),
    [range.start, view],
  );

  const moveMutation = useMutation({
    mutationFn: async (vars: { postId: string; scheduledAtUtc: string }) => move({ data: vars }),
    onSuccess: () => {
      toast.success("Post rescheduled.");
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["post-history"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (postId: string) => cancel({ data: { postId } }),
    onSuccess: () => {
      toast.success("Schedule cancelled — the post is back in drafts.");
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["post-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function dropOn(day: Date) {
    if (!dragId) return;
    const source = posts.find((p) => p.id === dragId);
    setDragId(null);
    if (!source) return;
    const previous = new Date(source.scheduledAtUtc ?? source.createdAt);
    const next = new Date(day);
    next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
    moveMutation.mutate({ postId: source.id, scheduledAtUtc: next.toISOString() });
  }

  const heading =
    view === "Day"
      ? cursor.toLocaleDateString(undefined, { dateStyle: "full" })
      : view === "Week"
        ? `Week of ${range.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Content calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "List" ? "All posts" : heading} · {localTimezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "List" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() =>
                  setCursor((c) =>
                    view === "Month"
                      ? new Date(c.getFullYear(), c.getMonth() - 1, 1)
                      : addDays(c, view === "Week" ? -7 : -1),
                  )
                }
                className="rounded-md border border-primary/50 p-2 hover:bg-accent"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setCursor(startOfDay(new Date()))}
                className="rounded-md border border-primary/50 px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next period"
                onClick={() =>
                  setCursor((c) =>
                    view === "Month"
                      ? new Date(c.getFullYear(), c.getMonth() + 1, 1)
                      : addDays(c, view === "Week" ? 7 : 1),
                  )
                }
                className="rounded-md border border-primary/50 p-2 hover:bg-accent"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex overflow-hidden rounded-md border border-primary/50">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold",
                  view === v ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <select
            aria-label="Filter by platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
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

      {query.isPending ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-8 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your calendar…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-dashed border-primary/60 p-6 text-center">
          <p className="font-semibold">Could not load the calendar.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : view === "List" ? (
        posts.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
                <div className="mesh-vanilla grid h-14 w-11 place-items-center rounded-lg border border-border bg-primary/10 text-[10px] font-semibold">
                  {p.mediaCount || "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title || p.caption || "Untitled post"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.scheduledAtUtc
                      ? new Date(p.scheduledAtUtc).toLocaleString()
                      : `Created ${new Date(p.createdAt).toLocaleDateString()}`}{" "}
                    · {p.destinations.map((d) => d.platform).join(", ") || "no destinations"}
                  </p>
                </div>
                <span className="rounded-full border border-primary/40 px-2.5 py-1 text-xs font-semibold">
                  {POST_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {weekdays.map((d) => (
                <div key={d} className="px-2 py-1">{d}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {padCells.map((key) => (
                <div key={`pad-${key}`} className="min-h-28 rounded-xl border border-dashed border-primary/20" />
              ))}
              {cells.map((day) => {
                const dayPosts = byDay.get(dayKey(day)) ?? [];
                const isToday = dayKey(day) === dayKey(new Date());
                return (
                  <div
                    key={day.toISOString()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(day)}
                    className={cn(
                      "min-h-28 rounded-xl border p-2",
                      isToday ? "border-primary" : "border-border",
                      view === "Day" && "col-span-7 min-h-56",
                    )}
                  >
                    <p className="text-xs font-semibold opacity-70">{day.getDate()}</p>
                    <div className="mt-1.5 space-y-1.5">
                      {dayPosts.map((p) => (
                        <div
                          key={p.id}
                          draggable={p.status !== "published" && p.status !== "publishing"}
                          onDragStart={() => setDragId(p.id)}
                          className="surface-strong cursor-grab rounded-lg p-2 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold">
                              {p.destinations.map((d) => d.platform.slice(0, 2)).join(" ") || "—"}
                            </span>
                            <span className="ml-auto font-semibold">
                              {p.scheduledAtUtc
                                ? new Date(p.scheduledAtUtc).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "draft"}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 opacity-90">{p.title || p.caption}</p>
                          {p.scheduledAtUtc && p.status !== "published" && (
                            <button
                              type="button"
                              onClick={() => cancelMutation.mutate(p.id)}
                              className="mt-1 text-[10px] font-semibold underline"
                            >
                              Cancel schedule
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Drag a post card to another day to reschedule it — the time of day is preserved. Cancelling a
        schedule keeps the post as a draft.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mesh-vanilla rounded-2xl border border-dashed border-primary/50 px-6 py-16 text-center">
      <p className="text-base font-semibold">Nothing scheduled yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a post and pick a publish time to see it here.
      </p>
    </div>
  );
}
