UPDATE public.publishing_job_destinations
SET status = 'queued'::public.destination_status,
    locked_at = NULL,
    locked_by = NULL,
    next_retry_at = NULL,
    attempt_count = 0,
    max_attempts = GREATEST(max_attempts, 3),
    updated_at = now()
WHERE status IN ('validating','uploading');