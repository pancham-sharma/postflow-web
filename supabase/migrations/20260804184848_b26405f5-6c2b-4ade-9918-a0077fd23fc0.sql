CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
RETURNS SETOF public.publishing_job_destinations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id
    FROM public.publishing_job_destinations d
    JOIN public.platform_capabilities c ON c.platform = d.platform
    WHERE d.status IN ('pending','queued','retry_scheduled','rate_limited','processing')
      AND c.publishing_enabled = true
      AND c.maintenance_mode = false
      AND COALESCE(d.scheduled_for, now()) <= now()
      AND COALESCE(d.next_retry_at, now()) <= now()
      AND (d.locked_at IS NULL OR d.locked_at < now() - interval '10 minutes')
      AND d.attempt_count < d.max_attempts
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
$$;

REVOKE ALL ON FUNCTION public.claim_due_publishing_destinations(integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_publishing_destinations(integer, text) TO service_role;