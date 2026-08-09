ALTER TABLE public.social_posts REPLICA IDENTITY FULL;

ALTER TABLE public.social_post_destinations REPLICA IDENTITY FULL;

ALTER TABLE public.publishing_job_destinations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'social_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_posts;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'social_post_destinations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_post_destinations;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'publishing_job_destinations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.publishing_job_destinations;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
RETURNS SETOF public.publishing_job_destinations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM public.publishing_job_destinations d
    JOIN public.platform_capabilities c ON c.platform = d.platform
    WHERE d.status IN ('pending','queued','retry_scheduled','rate_limited','processing')
      AND c.publishing_enabled = true AND c.maintenance_mode = false
      AND COALESCE(d.scheduled_for, now()) <= now()
      AND COALESCE(d.next_retry_at, now()) <= now()
      AND (d.locked_at IS NULL OR d.locked_at < now() - interval '10 minutes')
      AND d.attempt_count < d.max_attempts
    ORDER BY COALESCE(d.scheduled_for, d.created_at) ASC
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE OF d SKIP LOCKED
  )
  UPDATE public.publishing_job_destinations t
  SET locked_at = now(), locked_by = _worker,
      status = CASE WHEN t.status = 'processing' THEN 'processing' ELSE 'validating' END,
      updated_at = now()
  FROM due WHERE t.id = due.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_publishing_destinations(integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_publishing_destinations(integer, text) TO service_role;