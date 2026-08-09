// Facebook Page publishing (photo, video, or link/text post).
// Personal profiles are never targeted: the Graph API only allows organic
// publishing to Pages, so a connection without a Page is rejected up front.
import { ProviderError, providerFetch, sanitizeResponse } from "./types";
import type { PublishingProviderAdapter, ProviderPublishInput } from "./types";
import { verifyFacebookPublishAccess } from "@/lib/facebook-graph.server";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Resolves the Page identity by asking Meta right now — stored OAuth scopes are
 * never used to decide whether publishing is allowed, because they may predate
 * the Meta app gaining pages_manage_posts.
 */
async function resolvePageTarget(input: ProviderPublishInput): Promise<{ pageId: string; pageToken: string }> {
  const { account } = input;
  const pageId = String(account.metadata["page_id"] ?? "").trim() || null;
  const storedPageToken = String(account.metadata["page_access_token"] ?? "").trim() || null;

  const access = await verifyFacebookPublishAccess({
    userToken: account.accessToken,
    pageId,
    fallbackPageToken: storedPageToken,
  });
  if (!access.allowed) {
    throw new ProviderError(access.message, { code: access.code, retryable: false });
  }
  return { pageId: access.pageId, pageToken: access.pageToken };
}

/** Graph error 100/200 on a video post is a Page permission problem, never a retry. */
function rethrowGraphError(error: unknown): never {
  if (error instanceof ProviderError) {
    const permissionish =
      error.code === "100" ||
      error.code === "200" ||
      /no permission to publish/i.test(error.message);
    if (permissionish) {
      throw new ProviderError(
        "Facebook refused this post because the Page has not granted content publishing permission. Reconnect Facebook and approve Page publishing.",
        { code: "facebook_publish_permission_missing", retryable: false, safeResponse: error.safeResponse },
      );
    }
  }
  throw error;
}

const facebook: PublishingProviderAdapter = {
  platform: "facebook",

  async publish(input) {
    const { media } = input;
    // Page posts must use the page-scoped token captured during account discovery.
    const { pageId, pageToken } = await resolvePageTarget(input);
    const message = [input.caption.trim(), input.hashtags.join(" ").trim()]
      .filter(Boolean)
      .join("\n\n");

    if (media.mediaType === "video") {
      if (!media.signedUrl) throw new ProviderError("Video file is unavailable.", { code: "media_unavailable" });
      console.log(`[FB_VIDEO_UPLOAD_START] page_id=${pageId}`);
      const result = await providerFetch("Facebook video post", `${GRAPH}/${pageId}/videos`, {
        method: "POST",
        body: new URLSearchParams({
          file_url: media.signedUrl,
          description: message,
          ...(input.title ? { title: input.title } : {}),
          access_token: pageToken,
        }),
      }).catch(rethrowGraphError);
      const id = String(result["id"] ?? "");
      return {
        status: "published",
        providerPostId: id,
        providerPostUrl: id ? `https://www.facebook.com/${id}` : undefined,
        rawResponseSafe: sanitizeResponse(result),
        retryable: false,
      };
    }

    if (media.mediaType === "image") {
      if (!media.signedUrl) throw new ProviderError("Image file is unavailable.", { code: "media_unavailable" });
      const result = await providerFetch("Facebook photo post", `${GRAPH}/${pageId}/photos`, {
        method: "POST",
        body: new URLSearchParams({
          url: media.signedUrl,
          message,
          published: "true",
          access_token: pageToken,
        }),
      }).catch(rethrowGraphError);
      const postId = String(result["post_id"] ?? result["id"] ?? "");
      return {
        status: "published",
        providerPostId: postId,
        providerPostUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
        rawResponseSafe: sanitizeResponse(result),
        retryable: false,
      };
    }

    const result = await providerFetch("Facebook feed post", `${GRAPH}/${pageId}/feed`, {
      method: "POST",
      body: new URLSearchParams({
        message,
        ...(input.linkUrl ? { link: input.linkUrl } : {}),
        access_token: pageToken,
      }),
    }).catch(rethrowGraphError);
    const id = String(result["id"] ?? "");
    return {
      status: "published",
      providerPostId: id,
      providerPostUrl: id ? `https://www.facebook.com/${id}` : undefined,
      rawResponseSafe: sanitizeResponse(result),
      retryable: false,
    };
  },
};

export default facebook;
