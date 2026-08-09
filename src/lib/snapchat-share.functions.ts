import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SnapchatShareMedia = {
  url: string | null;
  fileName: string;
  mimeType: string | null;
  caption: string;
};

/**
 * Returns a fresh signed URL for the video stored with a post so the user can
 * hand it straight to Snapchat (Creative Kit / share sheet). The original
 * upload always stays in PostFlow, so this can be used again at any time.
 */
export const getSnapchatShareMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ destinationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<SnapchatShareMedia> => {
    const { data: destination, error } = await context.supabase
      .from("social_post_destinations")
      .select("post_id, platform_caption, platform_hashtags")
      .eq("id", data.destinationId)
      .maybeSingle();
    if (error) throw error;
    if (!destination) throw new Error("That destination is no longer available.");

    const { data: post } = await context.supabase
      .from("social_posts")
      .select("base_caption, base_hashtags")
      .eq("id", destination.post_id)
      .maybeSingle();

    const { data: media } = await context.supabase
      .from("social_post_media")
      .select("storage_path, mime_type, original_filename")
      .eq("post_id", destination.post_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    let url: string | null = null;
    if (media?.storage_path) {
      const { signedMediaUrl } = await import("@/lib/media-processing.server");
      url = await signedMediaUrl(media.storage_path);
    }
    if (!url) {
      console.info("[SNAP_SHARE_READY] stored video missing for destination");
    }

    const hashtags = destination.platform_hashtags ?? post?.base_hashtags ?? [];
    const caption = [
      destination.platform_caption ?? post?.base_caption ?? "",
      (hashtags as string[]).join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      url,
      fileName: media?.original_filename || "postflow-video.mp4",
      mimeType: media?.mime_type ?? null,
      caption,
    };
  });
