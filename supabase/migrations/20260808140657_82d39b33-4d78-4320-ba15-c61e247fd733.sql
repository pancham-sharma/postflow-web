ALTER TABLE public.publishing_job_destinations
  ADD COLUMN IF NOT EXISTS youtube_upload_session text,
  ADD COLUMN IF NOT EXISTS youtube_bytes_uploaded bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_video_id text,
  ADD COLUMN IF NOT EXISTS upload_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS upload_completed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS publishing_job_destinations_progress_idx
  ON public.publishing_job_destinations (status, last_progress_at);

CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
 RETURNS SETOF publishing_job_destinations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id
    FROM public.publishing_job_destinations d
    JOIN public.platform_capabilities c ON c.platform = d.platform
    WHERE c.publishing_enabled = true
      AND c.maintenance_mode = false
      AND COALESCE(d.scheduled_for, now()) <= now()
      AND COALESCE(d.next_retry_at, now()) <= now()
      AND d.attempt_count < d.max_attempts
      AND (
        (
          d.status IN ('pending','queued','retry_scheduled','rate_limited','processing')
          AND (d.locked_at IS NULL OR d.locked_at < now() - interval '10 minutes')
        )
        OR
        -- Orphaned in-flight work: only reclaim when the upload has genuinely
        -- stalled. An upload that is still sending bytes keeps last_progress_at
        -- fresh and must never be taken over by a second worker.
        (
          d.status IN ('validating','uploading')
          AND (d.last_progress_at IS NULL OR d.last_progress_at < now() - interval '10 minutes')
          AND (
            (d.locked_at IS NOT NULL AND d.locked_at < now() - interval '15 minutes')
            OR (d.locked_at IS NULL AND d.updated_at < now() - interval '5 minutes')
          )
        )
      )
    ORDER BY COALESCE(d.scheduled_for, d.created_at) ASC
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE OF d SKIP LOCKED
  )
  UPDATE public.publishing_job_destinations t
  SET locked_at = now(),
      locked_by = _worker,
      status = CASE
        WHEN t.status = 'processing'::public.destination_status THEN 'processing'::public.destination_status
        ELSE 'validating'::public.destination_status
      END,
      updated_at = now()
  FROM due
  WHERE t.id = due.id
  RETURNING t.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recover_stuck_publishing_destinations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected integer := 0;
BEGIN
  WITH stuck AS (
    UPDATE public.publishing_job_destinations d
    SET status = 'failed'::public.destination_status,
        locked_at = NULL,
        locked_by = NULL,
        next_retry_at = NULL,
        last_error_code = 'publish_timeout',
        last_error_message = 'Publishing stopped making progress before the platform confirmed the upload. Press Retry to resume it.',
        updated_at = now()
    WHERE d.status IN ('pending','queued','validating','uploading','processing','retry_scheduled','rate_limited')
      AND d.updated_at < now() - interval '45 minutes'
      -- Never time out an upload that is still streaming bytes.
      AND (d.last_progress_at IS NULL OR d.last_progress_at < now() - interval '20 minutes')
      -- Never time out something YouTube already accepted; that is polled instead.
      AND d.youtube_video_id IS NULL
      AND d.attempt_count >= d.max_attempts
    RETURNING d.social_post_destination_id
  )
  SELECT count(*) INTO affected FROM stuck;

  UPDATE public.social_post_destinations s
  SET publish_status = 'failed'::public.destination_status,
      error_code = 'publish_timeout',
      error_message = 'Publishing stopped making progress before the platform confirmed the upload. Press Retry to resume it.'
  WHERE s.id IN (
    SELECT d.social_post_destination_id
    FROM public.publishing_job_destinations d
    WHERE d.last_error_code = 'publish_timeout'
      AND d.status = 'failed'::public.destination_status
      AND d.updated_at > now() - interval '5 minutes'
  );

  RETURN affected;
END;
$function$;