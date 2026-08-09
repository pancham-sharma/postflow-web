-- ============ publish_jobs additions ============
ALTER TABLE public.publish_jobs
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- ============ admin_api_keys ============
CREATE TABLE public.admin_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  description text,
  key_prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  request_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_api_keys TO authenticated;
GRANT ALL ON public.admin_api_keys TO service_role;
ALTER TABLE public.admin_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read api keys"
  ON public.admin_api_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER admin_api_keys_set_updated_at
  BEFORE UPDATE ON public.admin_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX admin_api_keys_active_idx ON public.admin_api_keys (revoked_at, created_at DESC);

-- ============ publish_job_attempts ============
CREATE TABLE public.publish_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.publish_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  request_payload jsonb,
  provider_response jsonb,
  error_code text,
  error_message text,
  backoff_seconds integer,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, attempt_number)
);

GRANT SELECT ON public.publish_job_attempts TO authenticated;
GRANT ALL ON public.publish_job_attempts TO service_role;
ALTER TABLE public.publish_job_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and support can read job attempts"
  ON public.publish_job_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Users can read attempts of their own jobs"
  ON public.publish_job_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.publish_jobs j
    WHERE j.id = publish_job_attempts.job_id AND j.user_id = auth.uid()
  ));

CREATE INDEX publish_job_attempts_job_idx
  ON public.publish_job_attempts (job_id, attempt_number);

-- ============ publish_job_events ============
CREATE TABLE public.publish_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.publish_jobs(id) ON DELETE CASCADE,
  attempt_number integer,
  kind text NOT NULL,
  message text NOT NULL,
  detail jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.publish_job_events TO authenticated;
GRANT ALL ON public.publish_job_events TO service_role;
ALTER TABLE public.publish_job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and support can read job events"
  ON public.publish_job_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Users can read events of their own jobs"
  ON public.publish_job_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.publish_jobs j
    WHERE j.id = publish_job_events.job_id AND j.user_id = auth.uid()
  ));

CREATE INDEX publish_job_events_job_idx
  ON public.publish_job_events (job_id, occurred_at);

-- ============ platform_health ============
CREATE TABLE public.platform_health (
  platform text PRIMARY KEY,
  sync_status text NOT NULL DEFAULT 'unknown',
  last_webhook_at timestamptz,
  last_poll_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  failure_alert_threshold integer NOT NULL DEFAULT 3,
  stale_sync_alert_minutes integer NOT NULL DEFAULT 60,
  permission_expiry_alert_days integer NOT NULL DEFAULT 7,
  alert_message text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_health TO authenticated;
GRANT ALL ON public.platform_health TO service_role;
ALTER TABLE public.platform_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read platform health"
  ON public.platform_health FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update platform health"
  ON public.platform_health FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER platform_health_set_updated_at
  BEFORE UPDATE ON public.platform_health
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ seed platform health ============
INSERT INTO public.platform_health
  (platform, sync_status, last_webhook_at, last_poll_at, last_success_at, last_error_at, last_error_message, consecutive_failures)
VALUES
  ('instagram', 'healthy', now() - interval '4 minutes', now() - interval '9 minutes', now() - interval '4 minutes', NULL, NULL, 0),
  ('facebook', 'healthy', now() - interval '12 minutes', now() - interval '12 minutes', now() - interval '12 minutes', now() - interval '3 days', 'Transient 500 from Graph API', 0),
  ('pinterest', 'degraded', now() - interval '3 hours', now() - interval '25 minutes', now() - interval '3 hours', now() - interval '20 minutes', 'Webhook deliveries lagging; falling back to polling', 2),
  ('youtube', 'healthy', NULL, now() - interval '7 minutes', now() - interval '7 minutes', NULL, NULL, 0),
  ('tiktok', 'failing', NULL, now() - interval '2 minutes', now() - interval '9 hours', now() - interval '2 minutes', 'invalid_grant: refresh token rejected by provider', 5),
  ('snapchat', 'unknown', NULL, NULL, NULL, NULL, NULL, 0);

-- ============ seed example jobs, attempts and timeline ============
DO $$
DECLARE
  demo_user uuid;
  job_a uuid;
  job_b uuid;
BEGIN
  SELECT id INTO demo_user FROM public.profiles ORDER BY created_at LIMIT 1;
  IF demo_user IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.publish_jobs
    (user_id, platform, post_title, status, attempt_count, max_attempts, error_code, error_message,
     provider_response, request_payload, scheduled_for, started_at, finished_at, duration_ms, created_at)
  VALUES (demo_user, 'tiktok', 'Summer reel — behind the scenes', 'failed', 2, 3,
     'invalid_grant',
     'The refresh token was rejected by TikTok. Reconnect the account to continue publishing.',
     '{"error":{"code":"invalid_grant","message":"Refresh token expired","log_id":"tt-9f21c"}}'::jsonb,
     '{"caption":"Behind the scenes of our summer shoot ☀️","media":["reel-summer-v2.mp4"],"privacy":"public","allow_comments":true}'::jsonb,
     now() - interval '9 hours', now() - interval '9 hours', now() - interval '9 hours' + interval '4 seconds', 4120,
     now() - interval '9 hours')
  RETURNING id INTO job_a;

  INSERT INTO public.publish_jobs
    (user_id, platform, post_title, status, attempt_count, max_attempts, error_code, error_message,
     provider_response, request_payload, scheduled_for, started_at, finished_at, duration_ms, created_at)
  VALUES (demo_user, 'pinterest', 'Autumn moodboard pin set', 'failed', 1, 3,
     'rate_limited',
     'Pinterest returned 429 Too Many Requests for this board.',
     '{"error":{"code":429,"message":"Too many requests","retry_after":600}}'::jsonb,
     '{"board_id":"moodboards","title":"Autumn moodboard","media":["autumn-1.jpg","autumn-2.jpg"],"link":"https://example.com/autumn"}'::jsonb,
     now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours' + interval '2 seconds', 1980,
     now() - interval '2 hours')
  RETURNING id INTO job_b;

  INSERT INTO public.publish_job_attempts
    (job_id, attempt_number, status, request_payload, provider_response, error_code, error_message,
     backoff_seconds, started_at, finished_at, duration_ms, created_at)
  VALUES
    (job_a, 1, 'failed',
     '{"caption":"Behind the scenes of our summer shoot","media":["reel-summer.mp4"],"privacy":"public","allow_comments":true}'::jsonb,
     '{"error":{"code":"invalid_grant","message":"Refresh token expired","log_id":"tt-4a01b"}}'::jsonb,
     'invalid_grant', 'Refresh token expired', NULL,
     now() - interval '9 hours', now() - interval '9 hours' + interval '3 seconds', 3010, now() - interval '9 hours'),
    (job_a, 2, 'failed',
     '{"caption":"Behind the scenes of our summer shoot ☀️","media":["reel-summer-v2.mp4"],"privacy":"public","allow_comments":true}'::jsonb,
     '{"error":{"code":"invalid_grant","message":"Refresh token expired","log_id":"tt-9f21c"}}'::jsonb,
     'invalid_grant', 'Refresh token expired', 60,
     now() - interval '8 hours', now() - interval '8 hours' + interval '4 seconds', 4120, now() - interval '8 hours'),
    (job_b, 1, 'failed',
     '{"board_id":"moodboards","title":"Autumn moodboard","media":["autumn-1.jpg","autumn-2.jpg"],"link":"https://example.com/autumn"}'::jsonb,
     '{"error":{"code":429,"message":"Too many requests","retry_after":600}}'::jsonb,
     'rate_limited', 'Too many requests', NULL,
     now() - interval '2 hours', now() - interval '2 hours' + interval '2 seconds', 1980, now() - interval '2 hours');

  INSERT INTO public.publish_job_events (job_id, attempt_number, kind, message, detail, occurred_at)
  VALUES
    (job_a, NULL, 'queued', 'Job queued for TikTok', NULL, now() - interval '9 hours' - interval '1 minute'),
    (job_a, 1, 'started', 'Attempt 1 sent to provider', NULL, now() - interval '9 hours'),
    (job_a, 1, 'failed', 'Attempt 1 failed: invalid_grant', '{"log_id":"tt-4a01b"}'::jsonb, now() - interval '9 hours' + interval '3 seconds'),
    (job_a, 2, 'retried', 'Requeued with 60s backoff', '{"backoff_seconds":60}'::jsonb, now() - interval '8 hours' - interval '1 minute'),
    (job_a, 2, 'started', 'Attempt 2 sent to provider', NULL, now() - interval '8 hours'),
    (job_a, 2, 'failed', 'Attempt 2 failed: invalid_grant', '{"log_id":"tt-9f21c"}'::jsonb, now() - interval '8 hours' + interval '4 seconds'),
    (job_b, NULL, 'queued', 'Job queued for Pinterest', NULL, now() - interval '2 hours' - interval '2 minutes'),
    (job_b, 1, 'started', 'Attempt 1 sent to provider', NULL, now() - interval '2 hours'),
    (job_b, 1, 'failed', 'Attempt 1 failed: rate_limited', '{"retry_after":600}'::jsonb, now() - interval '2 hours' + interval '2 seconds');
END $$;
