import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotifications,
  markNotificationUnread,
  markNotificationsRead,
} from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — PostFlow" },
      { name: "description", content: "Publishing results, expiring connections, upload progress and storage alerts in one live feed." },
      { property: "og:title", content: "Notifications — PostFlow" },
      { property: "og:description", content: "Everything PostFlow needs you to know about your publishing pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

const filters = ["All", "Unread"] as const;

function NotificationsPage() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const markUnread = useServerFn(markNotificationUnread);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAll({}),
  });

  // Live feed: new rows push straight into the list.
  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;
  const visible = useMemo(
    () => (filter === "Unread" ? items.filter((n) => !n.readAt) : items),
    [filter, items],
  );

  const readMutation = useMutation({
    mutationFn: async (vars: { ids?: string[]; all?: boolean }) =>
      markRead({ data: { ids: vars.ids ?? [], all: vars.all ?? false } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const unreadMutation = useMutation({
    mutationFn: async (id: string) => markUnread({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.isPending ? "Loading…" : `${unread} unread of ${items.length}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-primary/50">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold",
                  filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => readMutation.mutate({ all: true })}
            disabled={unread === 0 || readMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            <CheckCheck className="size-4" aria-hidden /> Mark all as read
          </button>
        </div>
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-8 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading notifications…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-dashed border-primary/60 p-6 text-center">
          <p className="font-semibold">Could not load notifications.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="mesh-vanilla rounded-2xl border border-dashed border-primary/50 px-6 py-16 text-center">
          <p className="text-base font-semibold">
            {filter === "Unread" ? "You're all caught up" : "No notifications yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Publishing results, expiring connections and storage alerts appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <li
              key={n.id}
              className={cn("flex gap-3 rounded-2xl p-4", !n.readAt ? "surface-strong" : "border border-border")}
            >
              <Bell className="mt-0.5 size-4.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-sm opacity-85">{n.message}</p>
                <p className="mt-1 text-xs opacity-70">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  n.readAt ? unreadMutation.mutate(n.id) : readMutation.mutate({ ids: [n.id] })
                }
                className="h-fit rounded-md border border-primary/50 px-2.5 py-1 text-xs font-semibold hover:bg-accent"
              >
                {n.readAt ? "Mark unread" : "Mark read"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
