// YouTube Data API resumable upload. Storage is read in bounded chunks so large
// videos never need to fit in the server runtime's memory, and every failure is
// mapped to a specific, user-readable reason (auth, media, quota, API response).
import { ProviderError, providerFetch, sanitizeResponse, isRetryableStatus } from "./types";
import type { PublishingProviderAdapter, ProviderMedia } from "./types";
import { readYouTubeOptions, resolveIsShort } from "@/lib/youtube-options";

const UPLOAD =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const CHUNK_SIZE = 24 * 1024 * 1024;
const MAX_BYTES = 128 * 1024 * 1024 * 1024; // YouTube hard limit: 128 GB.
const SHORTS_MAX_SECONDS = 180;

/** Maps a YouTube/Google API error body to a specific message + retry decision. */
function describeApiError(
  status: number,
  body: Record<string, any>,
): { message: string; code: string; retryable: boolean } {
  const error = body["error"] ?? {};
  const reason = String(error?.errors?.[0]?.reason ?? error?.status ?? "");
  const apiMessage = typeof error?.message === "string" ? error.message : "";

  if (status === 401) {
    return {
      message:
        "YouTube rejected the access token. Reconnect the YouTube account to grant upload access again.",
      code: "token_expired",
      retryable: false,
    };
  }
  if (status === 403 && /quota/i.test(reason + apiMessage)) {
    return {
      message:
        "The YouTube API upload quota for today is exhausted. The upload will be retried automatically.",
      code: "quota_exceeded",
      retryable: true,
    };
  }
  if (status === 403) {
    return {
      message: apiMessage
        ? `YouTube refused the upload: ${apiMessage}`
        : "This YouTube channel is not allowed to upload videos. Check channel standing and that the account granted the upload scope.",
      code: reason || "forbidden",
      retryable: false,
    };
  }
  if (status === 400) {
    return {
      message: apiMessage
        ? `YouTube rejected the video details: ${apiMessage}`
        : "YouTube rejected the video details (title, description or tags).",
      code: reason || "invalid_metadata",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      message: "YouTube is rate limiting uploads right now. The upload will be retried automatically.",
      code: "rate_limited",
      retryable: true,
    };
  }
  return {
    message: apiMessage
      ? `YouTube upload failed: ${apiMessage}`
      : `YouTube upload failed with HTTP ${status}. The upload will be retried automatically.`,
    code: reason || `http_${status}`,
    retryable: isRetryableStatus(status),
  };
}

async function readBody(response: Response): Promise<Record<string, any>> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/**
 * Asks YouTube how much of an existing resumable session it already holds.
 * Returns the byte offset to continue from, or the finished video body when the
 * session already completed (which happens when a worker died right after the
 * final chunk was accepted — this is what prevents duplicate uploads).
 */
async function probeSession(
  uploadUrl: string,
  fileSize: number,
  accessToken: string,
): Promise<{ offset: number; completed: Record<string, any> | null } | null> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Range": `bytes */${fileSize}`,
        "Content-Length": "0",
      },
    });
  } catch {
    return null; // Treat an unreachable session as unknown; caller opens a new one.
  }
  if (response.status === 308) {
    const acknowledged = response.headers.get("range")?.match(/bytes=0-(\d+)/i)?.[1];
    return { offset: acknowledged ? Number(acknowledged) + 1 : 0, completed: null };
  }
  if (response.ok) {
    const body = await readBody(response);
    return { offset: fileSize, completed: body };
  }
  // 404/410 — the session expired. The caller starts a fresh one.
  return null;
}

/** Reads one byte range from storage. */
async function readRange(mediaUrl: string, offset: number, end: number): Promise<ArrayBuffer> {
  const asset = await fetch(mediaUrl, { headers: { Range: `bytes=${offset}-${end}` } });
  if (!asset.ok) {
    throw new ProviderError(
      "The video file could not be read from storage — re-upload the file and try again.",
      { code: "media_unavailable", retryable: asset.status >= 500 },
    );
  }
  const bytes = await asset.arrayBuffer();
  if (bytes.byteLength !== end - offset + 1) {
    throw new ProviderError("Storage did not return the requested video segment.", {
      code: "media_range_unavailable",
      retryable: true,
    });
  }
  return bytes;
}

async function uploadChunks(
  uploadUrl: string,
  mediaUrl: string,
  mimeType: string,
  fileSize: number,
  accessToken: string,
  startOffset = 0,
  onProgress?: (bytesUploaded: number) => Promise<void>,
): Promise<Record<string, any>> {
  let offset = Math.max(0, Math.min(startOffset, fileSize));
  // Pre-fetch the next chunk from storage while the current one uploads so the
  // two network legs overlap instead of running back to back.
  let prefetch: { offset: number; bytes: Promise<ArrayBuffer> } | null = null;
  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize) - 1;
    const bytes =
      prefetch && prefetch.offset === offset
        ? await prefetch.bytes
        : await readRange(mediaUrl, offset, end);
    prefetch = null;
    const nextOffset = end + 1;
    if (nextOffset < fileSize) {
      const nextEnd = Math.min(nextOffset + CHUNK_SIZE, fileSize) - 1;
      const pending = readRange(mediaUrl, nextOffset, nextEnd);
      pending.catch(() => {}); // Handled when awaited on the next loop.
      prefetch = { offset: nextOffset, bytes: pending };
    }
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType,
          "Content-Range": `bytes ${offset}-${end}/${fileSize}`,
        },
        body: bytes,
      });
    } catch {
      throw new ProviderError(
        `The connection to YouTube dropped while sending ${Math.round((offset / fileSize) * 100)}% of the video. It will be retried automatically.`,
        { code: "network_error", retryable: true },
      );
    }
    if (response.status === 308) {
      const acknowledged = response.headers.get("range")?.match(/bytes=0-(\d+)/i)?.[1];
      // A missing Range header means YouTube has not confirmed any bytes for
      // this request. Retry the same chunk instead of skipping video bytes.
      offset = acknowledged ? Number(acknowledged) + 1 : offset;
      // Heartbeat: durable proof this upload is still making progress, so the
      // stuck-job sweeper never times out a healthy large upload.
      if (onProgress) await onProgress(offset).catch(() => {});
      console.info(
        "[YOUTUBE_UPLOAD_PROGRESS]",
        JSON.stringify({ uploaded: offset, total: fileSize, percent: Math.round((offset / fileSize) * 100) }),
      );
      continue;
    }
    const body = await readBody(response);
    if (!response.ok) {
      const described = describeApiError(response.status, body);
      throw new ProviderError(described.message, {
        code: described.code,
        retryable: described.retryable,
        safeResponse: { ...sanitizeResponse(body), http_status: response.status },
      });
    }
    if (onProgress) await onProgress(fileSize).catch(() => {});
    return body;
  }
  throw new ProviderError("YouTube upload ended without returning a video.", {
    code: "empty_upload_response",
    retryable: true,
  });
}

/** Pre-flight media checks so obvious problems fail with a clear reason, not a 400. */
function assertMediaUploadable(media: ProviderMedia) {
  if (media.mediaType !== "video" || !media.signedUrl) {
    throw new ProviderError(
      "YouTube only accepts video uploads — attach a video file (MP4 or MOV) for this destination.",
      { code: "media_unsupported" },
    );
  }
  const mime = media.mimeType ?? "";
  if (mime && !mime.startsWith("video/")) {
    throw new ProviderError(
      `YouTube cannot accept "${mime}" — the file must be a video (MP4, MOV, WebM or AVI).`,
      { code: "mime_type_unsupported" },
    );
  }
  if (!media.fileSize) {
    throw new ProviderError(
      "The video's file size is unknown, so YouTube's resumable upload cannot start. Re-upload the file.",
      { code: "file_size_required" },
    );
  }
  if (media.fileSize > MAX_BYTES) {
    throw new ProviderError("YouTube's maximum video size is 128 GB.", {
      code: "file_too_large",
    });
  }
  if ((media.durationSeconds ?? 0) > 12 * 3600) {
    throw new ProviderError("YouTube's maximum video length is 12 hours.", {
      code: "duration_too_long",
    });
  }
}

const youtube: PublishingProviderAdapter = {
  platform: "youtube",

  async publish(input) {
    const { account, media } = input;
    assertMediaUploadable(media);
    if (!input.title.trim()) {
      throw new ProviderError("YouTube requires a video title.", { code: "title_required" });
    }

    const options = readYouTubeOptions(input.settings);
    const duration = media.durationSeconds ?? 0;
    if (options.shortsMode === "short" && duration > SHORTS_MAX_SECONDS) {
      throw new ProviderError(
        `This destination is set to publish as a Short, but the video is ${Math.round(duration)}s long — Shorts must be 3 minutes or less.`,
        { code: "shorts_duration_exceeded" },
      );
    }
    const isShort = resolveIsShort(options.shortsMode, media);

    // YouTube only files a clip under Shorts when the metadata says so, so the
    // #Shorts marker is written into the title, description and tags.
    const baseTitle = input.title.trim();
    const title = (
      isShort && !/#shorts/i.test(baseTitle) ? `${baseTitle.slice(0, 90)} #Shorts` : baseTitle
    ).slice(0, 100);
    const description = [
      input.description || input.caption,
      input.linkUrl,
      input.hashtags.join(" "),
      isShort && !/#shorts/i.test(input.description + input.caption) ? "#Shorts" : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 5000);
    const tags = Array.from(
      new Set(
        [
          ...input.hashtags.map((tag) => tag.replace(/^#/, "").trim()),
          ...(isShort ? ["Shorts", "YouTubeShorts"] : []),
        ].filter((tag) => tag.length > 0 && tag.length <= 60),
      ),
    ).slice(0, 15);

    const metadata = {
      snippet: {
        title,
        description,
        ...(tags.length ? { tags } : {}),
        categoryId: "22",
      },
      status: {
        privacyStatus: options.privacy,
        selfDeclaredMadeForKids: options.madeForKids,
        embeddable: true,
      },
    };

    const mime = media.mimeType ?? "video/mp4";
    const state = input.uploadState;

    // Step 0 — never upload the same video twice. If YouTube already returned a
    // video id for this destination, hand it to the status poller instead.
    if (state?.videoId) {
      console.info(
        "[YOUTUBE_UPLOAD_ALREADY_ACCEPTED]",
        JSON.stringify({ video_id: state.videoId }),
      );
      const known = await youtube.getStatus!(account, state.videoId);
      return {
        status: known.status === "failed" ? "failed" : known.status,
        providerPostId: state.videoId,
        providerJobId: state.videoId,
        providerPostUrl:
          known.providerPostUrl ??
          (isShort
            ? `https://www.youtube.com/shorts/${state.videoId}`
            : `https://www.youtube.com/watch?v=${state.videoId}`),
        ...(known.errorMessage ? { errorMessage: known.errorMessage } : {}),
        retryable: false,
      };
    }

    // Step 1 — resume the existing session when there is one, otherwise open a new one.
    let uploadUrl: string | null = null;
    let resumeOffset = 0;
    if (state?.sessionUrl) {
      const probe = await probeSession(state.sessionUrl, media.fileSize, account.accessToken);
      if (probe?.completed) {
        const resumedId = String(probe.completed["id"] ?? "");
        if (resumedId) {
          await state.save({ videoId: resumedId, bytesUploaded: media.fileSize, completedAt: new Date().toISOString() });
          console.info("[YOUTUBE_UPLOAD_RESUMED_COMPLETE]", JSON.stringify({ video_id: resumedId }));
          return {
            status: "processing",
            providerPostId: resumedId,
            providerJobId: resumedId,
            providerPostUrl: isShort
              ? `https://www.youtube.com/shorts/${resumedId}`
              : `https://www.youtube.com/watch?v=${resumedId}`,
            retryable: false,
          };
        }
      } else if (probe) {
        uploadUrl = state.sessionUrl;
        resumeOffset = probe.offset;
        console.info(
          "[YOUTUBE_UPLOAD_RESUMED]",
          JSON.stringify({ resume_offset: resumeOffset, total: media.fileSize }),
        );
      }
    }

    let start: Response | null = null;
    if (!uploadUrl) {
    try {
      start = await fetch(UPLOAD, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": media.mimeType ?? "video/mp4",
          "X-Upload-Content-Length": String(media.fileSize),
        },
        body: JSON.stringify(metadata),
      });
    } catch {
      throw new ProviderError(
        "YouTube could not be reached to start the upload. It will be retried automatically.",
        { code: "network_error", retryable: true },
      );
    }
    uploadUrl = start.headers.get("location");
    if (!start.ok || !uploadUrl) {
      const body = await readBody(start);
      const described = describeApiError(start.status, body);
      throw new ProviderError(described.message, {
        code: described.code,
        retryable: described.retryable,
        safeResponse: { ...sanitizeResponse(body), http_status: start.status },
      });
    }
      await state?.save({
        sessionUrl: uploadUrl,
        bytesUploaded: 0,
        startedAt: new Date().toISOString(),
      });
    }

    console.info(
      "[YOUTUBE_UPLOAD_STARTED]",
      JSON.stringify({
        channel: account.accountId,
        file_size: media.fileSize,
        mime,
        is_short: isShort,
        resume_offset: resumeOffset,
      }),
    );
    const result = await uploadChunks(
      uploadUrl,
      media.signedUrl!,
      mime,
      media.fileSize,
      account.accessToken,
      resumeOffset,
      state ? (bytes) => state.save({ bytesUploaded: bytes }) : undefined,
    );
    const id = String(result["id"] ?? "");
    if (!id) {
      console.error("[YOUTUBE_UPLOAD_FAILED]", JSON.stringify({ reason: "video_id_missing" }));
      throw new ProviderError("YouTube accepted the upload but did not return a video ID.", {
        code: "video_id_missing",
        retryable: true,
        safeResponse: sanitizeResponse(result),
      });
    }
    // Persist before any further checks: from here on a retry must never
    // re-upload the file.
    await state?.save({ videoId: id, bytesUploaded: media.fileSize, completedAt: new Date().toISOString() });
    console.info(
      "[YOUTUBE_UPLOAD_SUCCESS]",
      JSON.stringify({ video_id: id, upload_status: String(result["status"]?.uploadStatus ?? "") }),
    );
    const uploadedChannelId = String(result["snippet"]?.channelId ?? "");
    if (uploadedChannelId && uploadedChannelId !== account.accountId) {
      throw new ProviderError(
        `YouTube uploaded this video to a different channel than ${account.accountName}. Reconnect the intended channel and try again.`,
        {
          code: "youtube_channel_mismatch",
          safeResponse: sanitizeResponse(result),
        },
      );
    }
    const uploadStatus = String(result["status"]?.uploadStatus ?? "");
    if (uploadStatus === "failed" || uploadStatus === "rejected") {
      const detail =
        result["status"]?.failureReason ?? result["status"]?.rejectionReason ?? uploadStatus;
      throw new ProviderError(`YouTube rejected the video (${detail}).`, {
        code: `upload_${detail}`,
        retryable: detail === "uploadAborted",
        safeResponse: sanitizeResponse(result),
      });
    }
    return {
      status: uploadStatus === "processed" ? "published" : "processing",
      providerPostId: id,
      providerJobId: id,
      providerPostUrl: id
        ? isShort
          ? `https://www.youtube.com/shorts/${id}`
          : `https://www.youtube.com/watch?v=${id}`
        : undefined,
      rawResponseSafe: { ...sanitizeResponse(result), postflow_shorts: isShort, postflow_privacy: options.privacy },
      retryable: false,
    };
  },

  async getStatus(account, providerJobId) {
    const result = await providerFetch(
      "YouTube status",
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(providerJobId)}`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    const video = result["items"]?.[0];
    if (!video) {
      return {
        status: "failed",
        errorMessage:
          "YouTube no longer returns this uploaded video. It may have been removed, or the connected channel changed. Reconnect the intended channel and upload again.",
      };
    }
    if (video.snippet?.channelId && video.snippet.channelId !== account.accountId) {
      return {
        status: "failed",
        errorMessage: `This video was uploaded to a different YouTube channel than ${account.accountName}.`,
      };
    }
    const item = video.status;
    const status = item?.uploadStatus;
    if (status === "processed") {
      return {
        status: "published",
        providerPostId: providerJobId,
        providerPostUrl: `https://www.youtube.com/watch?v=${providerJobId}`,
      };
    }
    if (status === "failed" || status === "rejected") {
      const reason = item?.failureReason ?? item?.rejectionReason ?? "unknown reason";
      return {
        status: "failed",
        errorMessage: `YouTube rejected this video after processing (${reason}).`,
      };
    }
    return { status: "processing" };
  },
};

export default youtube;
