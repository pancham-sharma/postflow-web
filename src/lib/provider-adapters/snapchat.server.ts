// Snapchat publishing adapter.
//
//   Public Profile API capability verified  -> automatic publishing
//   anything else (401/403/no profile/not connected/not configured)
//                                           -> Creative Kit "Ready to share"
//
// The fallback is a normal, non-failing outcome (requires_user_action), never
// a publish failure. "published" is only ever returned after Snapchat confirms
// the Story / Spotlight content creation.
import { ProviderError } from "./types";
import type {
  PublishingProviderAdapter,
  ProviderPublishInput,
  ProviderPublishResult,
  ProviderPublishStatus,
  SocialAccountRecord,
} from "./types";
import {
  SNAPCHAT_DESTINATIONS,
  type SnapchatDestination,
} from "@/lib/snapchat-media-validation";
import { SNAPCHAT_ERROR_MESSAGES } from "@/lib/snapchat-errors";

export const SNAPCHAT_MANUAL_SHARE_CODE = "snapchat_manual_share_required";
export const SNAPCHAT_READY_TO_SHARE_MESSAGE =
  "Your video is ready. Open Snapchat to finish sharing it to your Story, Spotlight, or friends.";

function requestedDestination(settings: Record<string, unknown>): SnapchatDestination {
  const raw = String(settings["snapchat_destination"] ?? settings["snapchat_surface"] ?? "public_story")
    .toLowerCase()
    .replace(/[\s-]/g, "_");
  return (SNAPCHAT_DESTINATIONS as readonly string[]).includes(raw)
    ? (raw as SnapchatDestination)
    : "public_story";
}

/** Per-job Snapchat ids, so a retry never creates a duplicate post. */
async function readJobIds(jobDestinationId: string | undefined) {
  if (!jobDestinationId) return { mediaId: null as string | null, contentId: null as string | null };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("publishing_job_destinations")
    .select("snapchat_media_id, snapchat_content_id")
    .eq("id", jobDestinationId)
    .maybeSingle();
  return {
    mediaId: (data?.snapchat_media_id as string | null) ?? null,
    contentId: (data?.snapchat_content_id as string | null) ?? null,
  };
}

async function saveJobIds(
  jobDestinationId: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!jobDestinationId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("publishing_job_destinations")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", jobDestinationId);
}

function manualShare(reason: string): ProviderPublishResult {
  console.info("[SNAP_PP_CAPABILITY_UNAVAILABLE]", { reason });
  return {
    status: "failed",
    retryable: false,
    errorMessage: "Automatic Snapchat publishing is unavailable for this connection. Please verify your capability.",
    rawResponseSafe: { mode: "creative_kit", reason },
  };
}

const snapchat: PublishingProviderAdapter = {
  platform: "snapchat",

  async publish(input: ProviderPublishInput): Promise<ProviderPublishResult> {
    const service = await import("@/lib/snapchat-public-profile.server");
    const ownerId = input.ownerId;
    if (!ownerId) return manualShare("no_owner");

    const capability = await service.resolveAutomaticPublishing(ownerId);
    if (capability.mode === "creative_kit") return manualShare(capability.reason);

    const destination = requestedDestination(input.settings);
    if (!capability.destinations.includes(destination)) {
      // Snapchat does not report this surface for the profile — do not guess.
      return manualShare(`destination_unsupported:${destination}`);
    }

    console.info("[SNAP_PP_JOB_CLAIMED]", {
      job_destination_id: input.jobDestinationId ?? null,
      destination,
      attempt_number: input.attemptNumber ?? 1,
      public_profile_id: capability.publicProfileId,
    });

    // --- Media validation through the single shared service -----------------
    const validation = service.validateMedia(destination, {
      exists: Boolean(input.media.signedUrl),
      mimeType: input.media.mimeType,
      fileSize: input.media.fileSize,
      durationSeconds: input.media.durationSeconds,
      width: input.media.width,
      height: input.media.height,
    });
    if (!validation.ok) {
      const first = validation.issues[0]!;
      throw new ProviderError(first.message, { code: first.code, retryable: false });
    }

    const existing = await readJobIds(input.jobDestinationId);
    const caption = [input.caption, input.hashtags.join(" ")].filter(Boolean).join("\n\n");

    try {
      // --- Idempotency: an already-created post is confirmed, never recreated.
      if (existing.contentId) {
        return {
          status: "published",
          retryable: false,
          providerPostId: existing.contentId,
          rawResponseSafe: { mode: "public_profile_api", destination, reused: true },
        };
      }

      // --- Media: reuse an already-uploaded asset when present. --------------
      let mediaId = existing.mediaId;
      if (!mediaId) {
        const created = await service.createMedia({
          accessToken: capability.accessToken,
          publicProfileId: capability.publicProfileId,
          mediaUrl: input.media.signedUrl!,
          fileName: "postflow-video.mp4",
          mimeType: input.media.mimeType ?? "video/mp4",
        });
        mediaId = created.mediaId;
        await saveJobIds(input.jobDestinationId, {
          snapchat_media_id: mediaId,
          snapchat_destination: destination,
          remote_status: "uploaded",
        });
      }

      await service.waitForMedia(capability.accessToken, capability.publicProfileId, mediaId);
      await saveJobIds(input.jobDestinationId, { remote_status: "media_ready" });

      const content = await service.createContent({
        accessToken: capability.accessToken,
        publicProfileId: capability.publicProfileId,
        mediaId,
        destination,
        caption,
        idempotencyKey: input.idempotencyKey,
      });
      await saveJobIds(input.jobDestinationId, {
        snapchat_content_id: content.contentId,
        remote_status: "content_created",
      });

      // --- Confirmation: the ONLY path that may report "published". ---------
      const confirmation = content.confirmed
        ? { status: "published" as const, url: content.url }
        : await service.getContentStatus(capability.accessToken, content.contentId);

      if (confirmation.status === "published") {
        await saveJobIds(input.jobDestinationId, {
          remote_status: "published",
          published_at: new Date().toISOString(),
        });
        console.info("[SNAP_PP_PUBLISH_SUCCESS]", {
          snapchat_content_id: content.contentId,
          destination,
        });
        return {
          status: "published",
          retryable: false,
          providerPostId: content.contentId,
          providerPostUrl: confirmation.url ?? undefined,
          rawResponseSafe: { mode: "public_profile_api", destination },
        };
      }
      if (confirmation.status === "failed") {
        throw new ProviderError(SNAPCHAT_ERROR_MESSAGES.SNAPCHAT_PUBLISH_FAILED, {
          code: "SNAPCHAT_PUBLISH_FAILED",
          retryable: false,
        });
      }
      return {
        status: "processing",
        retryable: true,
        providerJobId: content.contentId,
        rawResponseSafe: { mode: "public_profile_api", destination, stage: "processing" },
      };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // Capability disappeared mid-flight (deauthorized / de-allowlisted):
      // degrade to manual sharing instead of failing the post.
      if (code === "SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE") {
        return manualShare("SNAPCHAT_PUBLIC_PROFILE_API_UNAVAILABLE");
      }
      if (error instanceof ProviderError) throw error;
      const retryable = Boolean((error as { retryable?: boolean })?.retryable);
      console.error("[SNAP_PP_PUBLISH_FAILED]", { code: code ?? "unknown" });
      throw new ProviderError(
        (error as Error)?.message ?? SNAPCHAT_ERROR_MESSAGES.SNAPCHAT_PUBLISH_FAILED,
        { code: code ?? "SNAPCHAT_PUBLISH_FAILED", retryable },
      );
    }
  },

  /** Polls a pending publication; still only "published" on confirmation. */
  async getStatus(account: SocialAccountRecord, providerJobId: string): Promise<ProviderPublishStatus> {
    const service = await import("@/lib/snapchat-public-profile.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("social_connections")
      .select("user_id")
      .eq("id", account.id)
      .maybeSingle();
    const ownerId = data?.user_id as string | undefined;
    if (!ownerId) return { status: "processing" };
    const capability = await service.resolveAutomaticPublishing(ownerId);
    if (capability.mode !== "public_profile_api") return { status: "processing" };
    const confirmation = await service.getContentStatus(capability.accessToken, providerJobId);
    if (confirmation.status === "published") {
      return {
        status: "published",
        providerPostId: providerJobId,
        providerPostUrl: confirmation.url ?? undefined,
      };
    }
    if (confirmation.status === "failed") {
      return { status: "failed", errorMessage: SNAPCHAT_ERROR_MESSAGES.SNAPCHAT_PUBLISH_FAILED };
    }
    return { status: "processing" };
  },
};

export default snapchat;
