import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  postId: string | null;
  socialAccountId: string | null;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: NotificationRow[]; unread: number }> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, message, read_at, created_at, post_id, social_account_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const items: NotificationRow[] = (data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      readAt: n.read_at,
      createdAt: n.created_at,
      postId: n.post_id,
      socialAccountId: n.social_account_id,
    }));
    return { items, unread: items.filter((n) => !n.readAt).length };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).max(200).default([]), all: z.boolean().default(false) })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (!data.all) {
      if (data.ids.length === 0) return { ok: true };
      query = query.in("id", data.ids);
    }
    const { error } = await query;
    if (error) throw error;
    return { ok: true };
  });

export const markNotificationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: null })
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
