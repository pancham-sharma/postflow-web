// Replaces the generic "the platform rejected it again" message with the real,
// safe reason, the attempt count and the action that actually fixes it.
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, RotateCcw } from "lucide-react";
import {
  classifyProviderError,
  FAILURE_ACTION_LABEL,
  PUBLISH_STAGE_LABEL,
  stageForCode,
  type FailureAction,
} from "@/lib/provider-error-map";
import type { DestinationStatus } from "@/lib/publishing-types";

export type DestinationFailure = {
  platform: string;
  status: DestinationStatus | string;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
};

function relativeMinutes(iso: string): string {
  const minutes = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function DestinationFailureCard({
  failure,
  onRetry,
  onRetryOriginalAudio,
  retrying,
}: {
  failure: DestinationFailure;
  onRetry?: () => void;
  onRetryOriginalAudio?: () => void;
  retrying?: boolean;
}) {
  const classified = classifyProviderError({
    code: failure.errorCode,
    message: failure.errorMessage,
  });
  const waiting = failure.status === "retry_scheduled" || failure.status === "rate_limited";
  const action: FailureAction = waiting ? "wait_and_retry" : classified.action;
  const stage = stageForCode(classified.code);
  const attempts = `${Math.min(failure.attemptCount || 1, failure.maxAttempts || 3)} of ${failure.maxAttempts || 3}`;
  const mediaStage = stage === "media_processing";
  // Creative Kit sharing is handled by SnapchatShareCard and is never a failure.
  const manualSnapchat = action === "finish_in_snapchat";
  // Permanent, configuration-style failures never consumed an upload attempt,
  // so showing "attempt 2 of 3" would be misleading.
  const permanentSetupIssue =
    !waiting &&
    (action === "select_facebook_page" ||
      action === "replace_stored_video" ||
      action === "fix_backend_configuration" ||
      action === "switch_account_type");

  return (
    <div className="w-full space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[11px]">
      <p className="flex items-center gap-1.5 font-semibold">
        {waiting ? (
          <Clock className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="capitalize">{failure.platform}</span>
        <span aria-hidden>·</span>
        <span>{waiting ? "Retrying" : "Action required"}</span>
        <span aria-hidden>·</span>
        <span className="font-normal opacity-80">{PUBLISH_STAGE_LABEL[stage]}</span>
      </p>
      {mediaStage && (
        <p className="text-muted-foreground">
          The account and the post are fine — only the audio mix failed.
        </p>
      )}
      <p className="text-muted-foreground">Reason: {failure.errorMessage || classified.reason}</p>
      {!permanentSetupIssue && <p className="text-muted-foreground">Attempt: {attempts}</p>}
      {permanentSetupIssue && (
        <p className="text-muted-foreground">
          No upload attempt was used — fix this once and retry with the saved video.
        </p>
      )}
      {waiting && failure.nextRetryAt && (
        <p className="text-muted-foreground">Next retry: in {relativeMinutes(failure.nextRetryAt)}</p>
      )}
      {!waiting && (
        <p className="text-muted-foreground">
          Retryable: No · Recommended action: {FAILURE_ACTION_LABEL[action]}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onRetry && !manualSnapchat && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1 rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent disabled:opacity-60"
          >
            <RotateCcw className="size-3" aria-hidden />
            {retrying ? "Retrying…" : "Retry with the saved video"}
          </button>
        )}
        {action === "select_facebook_page" && (
          <Link
            to="/app/accounts"
            className="rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent"
          >
            Choose Facebook Page
          </Link>
        )}
        {action === "replace_stored_video" && (
          <Link
            to="/app/create"
            className="rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent"
          >
            Re-upload the video
          </Link>
        )}
        {onRetryOriginalAudio && classified.action === "retry_original_audio_only" && (
          <button
            type="button"
            onClick={onRetryOriginalAudio}
            disabled={retrying}
            className="inline-flex items-center gap-1 rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent disabled:opacity-60"
          >
            <RotateCcw className="size-3" aria-hidden />
            Retry with the original audio
          </button>
        )}
        {classified.requiresReconnect && (
          <Link
            to="/app/accounts"
            className="rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent"
          >
            Reconnect {failure.platform}
          </Link>
        )}
        {classified.action === "convert_or_replace_video" && (
          <Link
            to="/app/media"
            className="rounded-md border border-primary/50 px-2 py-0.5 font-semibold hover:bg-accent"
          >
            Replace media
          </Link>
        )}
      </div>
      {failure.errorCode && <p className="pt-0.5 opacity-60">Error code: {failure.errorCode}</p>}
    </div>
  );
}
