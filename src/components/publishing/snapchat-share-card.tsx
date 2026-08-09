// Snapchat Creative Kit share. This is not a failure state: the video is
// prepared and stored, the user finishes the share inside Snapchat.
//
// Capability model (never hardcoded to "automatic"):
//   public_profile_api -> handled server-side, this card is never rendered
//   creative_kit       -> mobile share sheet receives the real MP4 file
//   manual_download    -> desktop / unsupported browsers download the MP4
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Ghost, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getSnapchatShareMedia } from "@/lib/snapchat-share.functions";

type ShareMode = "creative_kit" | "manual_download";

const SHARE_ERRORS = {
  SNAPCHAT_VIDEO_NOT_FOUND: "The stored video could not be found. Re-upload it on this post.",
  SNAPCHAT_VIDEO_DOWNLOAD_FAILED: "The stored video could not be downloaded. Try again.",
  SNAPCHAT_SHARE_UNSUPPORTED:
    "Snapchat could not be opened directly. Download the video and select it from Camera Roll.",
  SNAPCHAT_SHARE_CANCELLED: "Sharing was cancelled.",
  SNAPCHAT_SHARE_FAILED:
    "Snapchat could not be opened directly. Download the video and select it from Camera Roll.",
} as const;

type ShareErrorCode = keyof typeof SHARE_ERRORS;

/**
 * True only on a touch/mobile device whose browser can actually put a video
 * file into the OS share sheet. Windows/macOS expose navigator.share too, but
 * Snapchat is never a share target there, so we must not offer "Share".
 */
function detectFileShareSupport(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (!mobile && !touch) return false;
  try {
    const probe = new File([new Blob([new Uint8Array(1)])], "probe.mp4", { type: "video/mp4" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function SnapchatShareCard({ destinationId }: { destinationId: string }) {
  const fetchMedia = useServerFn(getSnapchatShareMedia);
  const [busy, setBusy] = useState(false);
  // Assume manual download until hydration proves the share sheet takes files.
  const [mode, setMode] = useState<ShareMode>("manual_download");
  const [downloaded, setDownloaded] = useState(false);
  const [shareOpened, setShareOpened] = useState(false);
  const [problem, setProblem] = useState<ShareErrorCode | null>(null);
  const canShareFile = mode === "creative_kit";

  useEffect(() => {
    const supported = detectFileShareSupport();
    console.info("[SNAP_WEB_SHARE_SUPPORTED]", supported);
    setMode(supported ? "creative_kit" : "manual_download");
    console.info("[SNAP_SHARE_READY]", supported ? "creative_kit" : "manual_download");
  }, []);

  const fail = (code: ShareErrorCode) => {
    setProblem(code);
    toast.error(SHARE_ERRORS[code]);
  };

  const loadBlob = async () => {
    let media: Awaited<ReturnType<typeof fetchMedia>>;
    try {
      media = await fetchMedia({ data: { destinationId } });
    } catch {
      fail("SNAPCHAT_VIDEO_NOT_FOUND");
      return null;
    }
    if (!media.url) {
      fail("SNAPCHAT_VIDEO_NOT_FOUND");
      return null;
    }
    try {
      const response = await fetch(media.url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      console.info("[SNAP_VIDEO_FETCHED]", blob.size);
      return { media, blob };
    } catch {
      fail("SNAPCHAT_VIDEO_DOWNLOAD_FAILED");
      return null;
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const loaded = await loadBlob();
      if (!loaded) return;
      // Keep the exact stored MP4 bytes — no re-encoding, no quality loss.
      const href = URL.createObjectURL(loaded.blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = loaded.media.fileName || "postflow-video.mp4";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setDownloaded(true);
      console.info("[SNAP_DOWNLOAD_FALLBACK]", "ok");
    } catch {
      fail("SNAPCHAT_VIDEO_DOWNLOAD_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const loaded = await loadBlob();
      if (!loaded) return;
      const file = new File([loaded.blob], loaded.media.fileName || "postflow-video.mp4", {
        type: loaded.media.mimeType || loaded.blob.type || "video/mp4",
      });
      if (!navigator.canShare?.({ files: [file] })) {
        // Share sheet refused the file — offer the download fallback instead.
        console.info("[SNAP_SHARE_FAILED]", "canShare=false");
        setMode("manual_download");
        fail("SNAPCHAT_SHARE_UNSUPPORTED");
        return;
      }
      // The OS share sheet decides which apps appear; completing the share does
      // NOT mean Snapchat received the video, so the status stays unchanged.
      await navigator.share({ files: [file], title: "Share to Snapchat", text: loaded.media.caption });
      console.info("[SNAP_SHARE_OPENED]", "share sheet completed");
      setShareOpened(true);
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") {
        console.info("[SNAP_SHARE_CANCELLED]", "user cancelled");
        setProblem("SNAPCHAT_SHARE_CANCELLED");
        return;
      }
      console.info("[SNAP_SHARE_FAILED]", (cause as Error)?.name ?? "unknown");
      fail("SNAPCHAT_SHARE_FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-1 rounded-lg border border-primary/30 bg-accent/40 p-2.5 text-[11px]">
      <p className="flex items-center gap-1.5 font-semibold">
        <Ghost className="size-3.5 shrink-0" aria-hidden />
        <span>Snapchat</span>
        <span aria-hidden>·</span>
        <span>Ready to share</span>
      </p>
      {canShareFile ? (
        <p className="text-muted-foreground">
          Your video is ready. Tap Share and pick Snapchat from your phone's share sheet to finish
          posting it to your Story, Spotlight, or friends.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Automatic Snapchat publishing is unavailable for this connection.
        </p>
      )}
      <p className="text-muted-foreground">Status: Action required · Action: Complete in Snapchat</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={canShareFile ? share : download}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : canShareFile ? (
            <Share2 className="size-3" aria-hidden />
          ) : (
            <Download className="size-3" aria-hidden />
          )}
          {canShareFile ? "Share in Snapchat" : "Download video"}
        </button>
        {canShareFile && (
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-0.5 font-semibold hover:bg-accent disabled:opacity-60"
          >
            <Download className="size-3" aria-hidden />
            Download video
          </button>
        )}
      </div>
      {problem && <p className="text-muted-foreground">{SHARE_ERRORS[problem]}</p>}
      {shareOpened && (
        <p className="text-muted-foreground">
          The share sheet opened. Snapchat confirms nothing back to PostFlow, so this stays “Ready to
          share” until Snapchat's publishing API confirms a post.
        </p>
      )}
      {!canShareFile && (
        <p className="text-muted-foreground">
          {downloaded
            ? "Video downloaded. Open Snapchat on your phone and choose it from Camera Roll."
            : "Download the video, then open Snapchat on your phone and choose it from Camera Roll."}
        </p>
      )}
      <p className="opacity-60">
        The original video stays saved in PostFlow — you never need to upload it again.
      </p>
    </div>
  );
}
