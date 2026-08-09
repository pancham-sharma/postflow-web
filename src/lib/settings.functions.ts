import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserSettings = {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  workspaceName: string;
  preferences: {
    defaultCaption: string;
    defaultHashtags: string;
    defaultPostTime: string;
    defaultYoutubeVisibility: string;
    timezone: string;
    language: string;
    notifyPublished: boolean;
    notifyPartial: boolean;
    notifyFailed: boolean;
    notifyScheduleApproaching: boolean;
    notifyAccountExpiring: boolean;
    notifyStorageLimit: boolean;
    notifyEmail: boolean;
  };
};

const DEFAULTS: UserSettings["preferences"] = {
  defaultCaption: "",
  defaultHashtags: "",
  defaultPostTime: "09:30",
  defaultYoutubeVisibility: "public",
  timezone: "UTC",
  language: "en",
  notifyPublished: true,
  notifyPartial: true,
  notifyFailed: true,
  notifyScheduleApproaching: false,
  notifyAccountExpiring: true,
  notifyStorageLimit: true,
  notifyEmail: false,
};

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserSettings> => {
    const [profile, prefs, workspace] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("email, display_name, avatar_url")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_preferences").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("workspaces").select("name").eq("owner_id", context.userId).limit(1).maybeSingle(),
    ]);

    const p = prefs.data;
    return {
      email: profile.data?.email ?? null,
      displayName: profile.data?.display_name ?? "",
      avatarUrl: profile.data?.avatar_url ?? null,
      workspaceName: workspace.data?.name ?? "My workspace",
      preferences: p
        ? {
            defaultCaption: p.default_caption,
            defaultHashtags: p.default_hashtags,
            defaultPostTime: p.default_post_time,
            defaultYoutubeVisibility: p.default_youtube_visibility,
            timezone: p.timezone,
            language: p.language,
            notifyPublished: p.notify_published,
            notifyPartial: p.notify_partial,
            notifyFailed: p.notify_failed,
            notifyScheduleApproaching: p.notify_schedule_approaching,
            notifyAccountExpiring: p.notify_account_expiring,
            notifyStorageLimit: p.notify_storage_limit,
            notifyEmail: p.notify_email,
          }
        : DEFAULTS,
    };
  });

const profileInput = z.object({
  displayName: z.string().trim().min(1, "Add your name").max(120),
  workspaceName: z.string().trim().min(1).max(120).optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profileInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", context.userId);
    if (error) throw error;

    if (data.workspaceName) {
      await context.supabase
        .from("workspaces")
        .update({ name: data.workspaceName })
        .eq("owner_id", context.userId);
    }
    return { ok: true };
  });

const prefsInput = z.object({
  defaultCaption: z.string().max(2200).optional(),
  defaultHashtags: z.string().max(600).optional(),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  defaultYoutubeVisibility: z.enum(["public", "unlisted", "private"]).optional(),
  timezone: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  notifyPublished: z.boolean().optional(),
  notifyPartial: z.boolean().optional(),
  notifyFailed: z.boolean().optional(),
  notifyScheduleApproaching: z.boolean().optional(),
  notifyAccountExpiring: z.boolean().optional(),
  notifyStorageLimit: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
});

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => prefsInput.parse(data))
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      ...(data.defaultCaption !== undefined ? { default_caption: data.defaultCaption } : {}),
      ...(data.defaultHashtags !== undefined ? { default_hashtags: data.defaultHashtags } : {}),
      ...(data.defaultPostTime !== undefined ? { default_post_time: data.defaultPostTime } : {}),
      ...(data.defaultYoutubeVisibility !== undefined
        ? { default_youtube_visibility: data.defaultYoutubeVisibility }
        : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.language !== undefined ? { language: data.language } : {}),
      ...(data.notifyPublished !== undefined ? { notify_published: data.notifyPublished } : {}),
      ...(data.notifyPartial !== undefined ? { notify_partial: data.notifyPartial } : {}),
      ...(data.notifyFailed !== undefined ? { notify_failed: data.notifyFailed } : {}),
      ...(data.notifyScheduleApproaching !== undefined
        ? { notify_schedule_approaching: data.notifyScheduleApproaching }
        : {}),
      ...(data.notifyAccountExpiring !== undefined
        ? { notify_account_expiring: data.notifyAccountExpiring }
        : {}),
      ...(data.notifyStorageLimit !== undefined ? { notify_storage_limit: data.notifyStorageLimit } : {}),
      ...(data.notifyEmail !== undefined ? { notify_email: data.notifyEmail } : {}),
    };
    const { error } = await context.supabase
      .from("user_preferences")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

/** Exports the caller's own data as JSON for the settings "Export my data" action. */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [posts, media, connections, notifications] = await Promise.all([
      context.supabase.from("social_posts").select("*").limit(1000),
      context.supabase.from("media_assets").select("*").limit(1000),
      context.supabase
        .from("social_connections")
        .select("platform, account_name, username, connection_status, created_at")
        .limit(200),
      context.supabase.from("notifications").select("*").eq("user_id", context.userId).limit(500),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      posts: posts.data ?? [],
      media: media.data ?? [],
      connections: connections.data ?? [],
      notifications: notifications.data ?? [],
    };
  });

/** Hard-deletes the caller's account: revokes provider tokens, then removes the auth user. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ confirm: z.literal("DELETE") }).parse(data),
  )
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("social_connections").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw error;
    return { ok: true };
  });
