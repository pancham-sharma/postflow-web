import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

let channelSequence = 0;

/**
 * Subscribes to live job changes over the realtime websocket and invalidates the
 * given query keys whenever a job row or job event changes. Returns whether the
 * websocket is currently connected so the UI can show a live indicator.
 */
export function useJobRealtime(queryKeys: string[][]) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const keySignature = JSON.stringify(queryKeys);
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    const keys: string[][] = JSON.parse(keySignature);
    let frame: ReturnType<typeof setTimeout> | null = null;

    const invalidate = () => {
      if (frame) return;
      // Coalesce bursts of row changes into one refetch.
      frame = setTimeout(() => {
        frame = null;
        for (const queryKey of keys) {
          void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
        }
      }, 250);
    };
    invalidateRef.current = invalidate;

    channelSequence += 1;
    const channel = supabase
      .channel(`postflow-live-${channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "publish_jobs" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "publishing_job_destinations" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_posts" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_destinations" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "publish_job_events" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "publishing_attempts" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_connections" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "media_assets" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "media_renders" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_capabilities" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_controls" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_health" }, invalidate)
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    // Fallback + recovery: refresh when the tab regains focus, and poll slowly
    // whenever the websocket is not delivering changes.
    const onVisible = () => {
      if (document.visibilityState === "visible") invalidateRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") invalidateRef.current();
    }, 15_000);

    return () => {
      if (frame) clearTimeout(frame);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, keySignature]);

  return live;
}
