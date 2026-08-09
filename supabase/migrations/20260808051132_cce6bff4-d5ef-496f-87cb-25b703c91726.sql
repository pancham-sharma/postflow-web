CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
 RETURNS SETOF public.publishing_job_destinations
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
        -- Normal waiting work.
        (
          d.status IN ('pending','queued','retry_scheduled','rate_limited','processing')
          AND (d.locked_at IS NULL OR d.locked_at < now() - interval '10 minutes')
        )
        OR
        -- Orphaned in-flight work: the worker that claimed it died (serverless
        -- timeout, restart) so the row would otherwise stay stuck forever.
        (
          d.status IN ('validating','uploading')
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

-- Sweeper: anything in-flight for far too long, or out of attempts, is failed
-- with an explicit reason instead of remaining Queued/Uploading forever.
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
        last_error_message = 'Publishing timed out before the platform confirmed the upload. Press Retry to run it again.',
        updated_at = now()
    WHERE d.status IN ('pending','queued','validating','uploading','processing','retry_scheduled','rate_limited')
      AND d.updated_at < now() - interval '45 minutes'
      AND d.attempt_count >= d.max_attempts
    RETURNING d.social_post_destination_id
  )
  SELECT count(*) INTO affected FROM stuck;

  UPDATE public.social_post_destinations s
  SET publish_status = 'failed'::public.destination_status,
      error_code = 'publish_timeout',
      error_message = 'Publishing timed out before the platform confirmed the upload. Press Retry to run it again.'
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

REVOKE ALL ON FUNCTION public.recover_stuck_publishing_destinations() FROM public;
GRANT EXECUTE ON FUNCTION public.recover_stuck_publishing_destinations() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('postflow-publishing-runner') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'postflow-publishing-runner');
SELECT cron.unschedule('postflow-publishing-runner-dev') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'postflow-publishing-runner-dev');

-- The publishing runner is configured after deployment, when the canonical
-- POSTFLOW_APP_URL and a current publishable key are available. Do not embed
-- preview URLs or API keys in a version-controlled migration.
