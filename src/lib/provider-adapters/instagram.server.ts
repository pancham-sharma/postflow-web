// Instagram Graph publishing: create a media container, then publish it.
import { ProviderError, providerFetch, sanitizeResponse } from "./types";
import type { PublishingProviderAdapter } from "./types";

// Accounts connected through Instagram Business Login get tokens that are only
// valid on graph.instagram.com — graph.facebook.com rejects them with
// "Invalid OAuth access token - Cannot parse access token".
const IG_GRAPH = "https://graph.instagram.com/v21.0";
const FB_GRAPH = "https://graph.facebook.com/v21.0";

function graphBase(scopes: string[] | undefined, metadata: Record<string, unknown>) {
  if (metadata["login_kind"] === "facebook") return FB_GRAPH;
  const list = scopes ?? [];
  return list.some((s) => s.startsWith("instagram_business_")) ? IG_GRAPH : FB_GRAPH;
}

function buildCaption(caption: string, hashtags: string[]) {
  return [caption.trim(), hashtags.join(" ").trim()].filter(Boolean).join("\n\n").slice(0, 2200);
}

const instagram: PublishingProviderAdapter = {
  platform: "instagram",

  async publish(input) {
    const { account, media } = input;
    if (!media.signedUrl || media.mediaType === "none") {
      throw new ProviderError("Instagram requires an image or video.", {
        code: "media_required",
      });
    }

    const igUserId = String(account.metadata["ig_user_id"] ?? account.accountId);
    const token = account.accessToken;
    const GRAPH = graphBase(account.scopes, account.metadata);
    const caption = buildCaption(input.caption, input.hashtags);

    const containerParams = new URLSearchParams({ caption, access_token: token });
    if (media.mediaType === "video") {
      containerParams.set("media_type", "REELS");
      containerParams.set("video_url", media.signedUrl);
    } else {
      containerParams.set("image_url", media.signedUrl);
    }

    const container = await providerFetch("Instagram media container", `${GRAPH}/${igUserId}/media`, {
      method: "POST",
      body: containerParams,
    });
    const containerId = container["id"];
    if (!containerId) {
      throw new ProviderError("Instagram did not return a media container.", {
        code: "no_container",
        retryable: true,
      });
    }

    // Video containers finish asynchronously; hand the job back for polling.
    if (media.mediaType === "video") {
      const status = await providerFetch(
        "Instagram container status",
        `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      );
      if (status["status_code"] !== "FINISHED") {
        return {
          status: "processing",
          providerJobId: String(containerId),
          rawResponseSafe: sanitizeResponse(status),
          retryable: true,
        };
      }
    }

    const published = await providerFetch(
      "Instagram publish",
      `${GRAPH}/${igUserId}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({ creation_id: String(containerId), access_token: token }),
      },
    );

    return {
      status: "published",
      providerPostId: String(published["id"] ?? containerId),
      providerPostUrl: `https://www.instagram.com/p/${published["id"] ?? containerId}/`,
      rawResponseSafe: sanitizeResponse(published),
      retryable: false,
    };
  },

  async getStatus(account, providerJobId) {
    const token = account.accessToken;
    const igUserId = String(account.metadata["ig_user_id"] ?? account.accountId);
    const GRAPH = graphBase(account.scopes, account.metadata);
    const status = await providerFetch(
      "Instagram container status",
      `${GRAPH}/${providerJobId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    if (status["status_code"] === "ERROR") {
      return { status: "failed", errorMessage: "Instagram could not process this video." };
    }
    if (status["status_code"] !== "FINISHED") return { status: "processing" };

    const published = await providerFetch("Instagram publish", `${GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: providerJobId, access_token: token }),
    });
    return {
      status: "published",
      providerPostId: String(published["id"] ?? providerJobId),
      providerPostUrl: `https://www.instagram.com/p/${published["id"] ?? providerJobId}/`,
    };
  },
};

export default instagram;
