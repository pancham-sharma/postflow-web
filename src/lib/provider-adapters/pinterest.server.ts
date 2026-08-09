// Pinterest v5 pin creation. A board is mandatory for every pin.
import { ProviderError, providerFetch, sanitizeResponse } from "./types";
import type { PublishingProviderAdapter } from "./types";

const API = "https://api.pinterest.com/v5";

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
            ? { source_type: "video_url", url: media.signedUrl, cover_image_url: media.signedUrl }
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
