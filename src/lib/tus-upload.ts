/**
 * Resumable TUS upload to Supabase Storage.
 *
 * Supabase's standard HTTP upload is capped at the global server file-size
 * limit (50 MB on the Free plan).  The TUS resumable-upload endpoint
 * (/storage/v1/upload/resumable) uses the bucket-level file_size_limit
 * instead (we set it to 512 MiB), so large videos upload cleanly on any
 * plan.
 *
 * References:
 *   https://supabase.com/docs/guides/storage/uploads/resumable-uploads
 */
import * as tus from "tus-js-client";

export interface TusUploadOptions {
  supabaseUrl: string;
  accessToken: string;
  bucket: string;
  path: string;
  file: File;
  contentType?: string;
  /** Called with 0–100 */
  onProgress?: (pct: number) => void;
  /** AbortSignal to cancel the upload */
  signal?: AbortSignal;
}

export function uploadViaResumableTus(opts: TusUploadOptions): Promise<void> {
  const {
    supabaseUrl,
    accessToken,
    bucket,
    path,
    file,
    contentType,
    onProgress,
    signal,
  } = opts;

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType ?? file.type ?? "application/octet-stream",
        cacheControl: "3600",
      },
      // 6 MiB chunks — stays well under per-request limits
      chunkSize: 6 * 1024 * 1024,
      onError(err) {
        reject(err);
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (onProgress && bytesTotal > 0) {
          onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        }
      },
      onSuccess() {
        resolve();
      },
    });

    if (signal) {
      if (signal.aborted) {
        upload.abort(true).catch(() => {});
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          upload.abort(true).catch(() => {});
          reject(new DOMException("Upload aborted", "AbortError"));
        },
        { once: true },
      );
    }

    upload.start();
  });
}
