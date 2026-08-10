// Pinterest v5 pin creation. A board is mandatory for every pin.
import { ProviderError, providerFetch, sanitizeResponse } from "./types";
import type { PublishingProviderAdapter } from "./types";

const API = "https://api.pinterest.com/v5";

async function registerVideo(accessToken: string) {
  const response = await fetch(`${API}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "video" }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || !body.media_id || !body.upload_url) {
    throw new ProviderError("Pinterest could not start the video upload.", {
      code: "pinterest_video_register_failed",
      retryable: response.status >= 500 || response.status === 429,
      safeResponse: sanitizeResponse(body),
    });
  }
  return body as { media_id: string; upload_url: string; upload_parameters?: Record<string, string> };
}

async function uploadPinterestVideo(
  accessToken: string,
  signedUrl: string,
  registration: { media_id: string; upload_url: string; upload_parameters?: Record<string, string> },
) {
  const source = await fetch(signedUrl);
  if (!source.ok) throw new ProviderError("Pinterest could not read the stored video.", { code: "media_unavailable" });
  const form = new FormData();
  for (const [key, value] of Object.entries(registration.upload_parameters ?? {})) form.set(key, value);
  form.set("file", new Blob([await source.arrayBuffer()], { type: "video/mp4" }), "postflow-video.mp4");
  const response = await fetch(registration.upload_url, { method: "POST", body: form });
  if (!response.ok && response.status !== 204) {
    throw new ProviderError("Pinterest rejected the video upload.", {
      code: "pinterest_video_upload_failed",
      retryable: response.status >= 500 || response.status === 429,
    });
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statusResponse = await fetch(`${API}/media/${registration.media_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const status = (await statusResponse.json().catch(() => ({}))) as Record<string, any>;
    const state = String(status.status ?? status.media_status ?? "").toUpperCase();
    if (["SUCCEEDED", "READY", "COMPLETED"].includes(state)) return;
    if (["FAILED", "ERROR", "REJECTED"].includes(state)) {
      throw new ProviderError("Pinterest could not process the uploaded video.", { code: "pinterest_video_processing_failed" });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new ProviderError("Pinterest is still processing the video. The pin will be retried.", {
    code: "pinterest_video_processing_timeout",
    retryable: true,
  });
}

const pinterest: PublishingProviderAdapter = {
  platform: "pinterest",

  async publish(input) {
    const { account, media, settings } = input;
    const boardId = String(settings["boardId"] ?? account.metadata["default_board_id"] ?? "");
    if (!boardId) {
      throw new ProviderError("Pinterest requires a board.", { code: "board_required" });
    }
    if (!media.signedUrl || media.mediaType === "none") {
      throw new ProviderError("Pinterest requires an image or video.", { code: "media_required" });
    }

    let videoMediaId: string | null = null;
    if (media.mediaType === "video") {
      if (!media.thumbnailUrl) {
        throw new ProviderError("Pinterest video Pins require a generated cover image.", {
          code: "pinterest_video_cover_required",
          retryable: false,
        });
      }
      const registration = await registerVideo(account.accessToken);
      await uploadPinterestVideo(account.accessToken, media.signedUrl, registration);
      videoMediaId = registration.media_id;
    }

    const result = await providerFetch("Pinterest pin", `${API}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        board_id: boardId,
        title: input.title.slice(0, 100) || undefined,
        description: [input.caption, input.hashtags.join(" ")].filter(Boolean).join("\n").slice(0, 800),
        ...(input.linkUrl ? { link: input.linkUrl } : {}),
        ...(media.altText ? { alt_text: media.altText.slice(0, 500) } : {}),
        media_source:
          media.mediaType === "video"
            ? { source_type: "video_id", media_id: videoMediaId, cover_image_url: media.thumbnailUrl }
            : { source_type: "image_url", url: media.signedUrl },
      }),
    });

    const id = String(result["id"] ?? "");
    return {
      status: "published",
      providerPostId: id,
      providerPostUrl: id ? `https://www.pinterest.com/pin/${id}/` : undefined,
      rawResponseSafe: sanitizeResponse(result),
      retryable: false,
    };
  },
};

export default pinterest;
