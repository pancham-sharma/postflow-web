-- ============ WORKSPACES ============
CREATE TYPE public.workspace_role AS ENUM ('owner','admin','member');

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
                 WHERE workspace_id = _workspace_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
                 WHERE workspace_id = _workspace_id AND user_id = _user_id
                   AND role IN ('owner','admin'))
$$;

CREATE POLICY "Members can read their workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Users can create workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Workspace admins can update" ON public.workspaces
  FOR UPDATE TO authenticated USING (public.is_workspace_admin(id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(id, auth.uid()));

CREATE POLICY "Members can read workspace membership" ON public.workspace_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can add members" ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can update members" ON public.workspace_members
  FOR UPDATE TO authenticated USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can remove members" ON public.workspace_members
  FOR DELETE TO authenticated USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Personal workspace for every existing user
INSERT INTO public.workspaces (name, owner_id)
SELECT COALESCE(p.display_name, split_part(COALESCE(p.email,'user'),'@',1)) || '''s workspace', p.id
FROM public.profiles p;
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner' FROM public.workspaces w
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.default_workspace_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name',
             split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data ->> 'full_name',
                   split_part(COALESCE(NEW.email,'user'),'@',1)) || '''s workspace', NEW.id)
  RETURNING id INTO ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.id, 'owner') ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============ ATTACH WORKSPACES TO EXISTING TABLES ============
ALTER TABLE public.social_connections ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.social_connections SET workspace_id = public.default_workspace_id(user_id) WHERE workspace_id IS NULL;
DELETE FROM public.social_connections WHERE workspace_id IS NULL;
ALTER TABLE public.social_connections ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.social_connections
  ADD COLUMN is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN publishing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN publishing_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN account_type text,
  ADD COLUMN connection_status text NOT NULL DEFAULT 'connected',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN last_refresh_at timestamptz,
  ADD COLUMN last_refresh_error text,
  ADD COLUMN refresh_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_successful_publish_at timestamptz,
  ADD COLUMN disconnected_at timestamptz;
CREATE INDEX social_connections_workspace_idx ON public.social_connections (workspace_id, platform);

ALTER TABLE public.publish_jobs ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.publish_jobs SET workspace_id = public.default_workspace_id(user_id) WHERE workspace_id IS NULL;

-- ============ PLATFORM CAPABILITIES ============
CREATE TABLE public.platform_capabilities (
  platform text PRIMARY KEY,
  publishing_enabled boolean NOT NULL DEFAULT true,
  oauth_enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  supported_post_types text[] NOT NULL DEFAULT '{}',
  supported_media_types text[] NOT NULL DEFAULT '{}',
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_scopes text[] NOT NULL DEFAULT '{}',
  rate_limit_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_retries integer NOT NULL DEFAULT 5,
  token_refresh_threshold_minutes integer NOT NULL DEFAULT 60,
  notice text,
  internal_notice text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_capabilities TO authenticated;
GRANT ALL ON public.platform_capabilities TO service_role;
ALTER TABLE public.platform_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read capabilities" ON public.platform_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update capabilities" ON public.platform_capabilities
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER platform_capabilities_updated_at BEFORE UPDATE ON public.platform_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_capabilities (platform, supported_post_types, supported_media_types, limits, required_scopes, rate_limit_config) VALUES
('instagram', '{image,video,carousel}', '{image/jpeg,image/png,video/mp4,video/quicktime}',
 '{"caption_max":2200,"hashtag_max":30,"video_max_seconds":90,"file_max_mb":100,"min_aspect":0.8,"max_aspect":1.91}',
 '{instagram_content_publish,instagram_basic,pages_show_list}', '{"per_hour":25}'),
('facebook', '{image,video,text,link}', '{image/jpeg,image/png,image/webp,video/mp4,video/quicktime}',
 '{"caption_max":63206,"video_max_seconds":14400,"file_max_mb":1024}',
 '{pages_manage_posts,pages_read_engagement,pages_show_list}', '{"per_hour":50}'),
('pinterest', '{image,video}', '{image/jpeg,image/png,video/mp4}',
 '{"title_max":100,"description_max":800,"file_max_mb":20,"board_required":true,"link_supported":true}',
 '{boards:read,pins:write}', '{"per_hour":100}'),
('youtube', '{video}', '{video/mp4,video/quicktime,video/webm}',
 '{"title_max":100,"description_max":5000,"file_max_mb":2048,"title_required":true,"privacy_options":["public","unlisted","private"]}',
 '{https://www.googleapis.com/auth/youtube.upload}', '{"per_hour":6}'),
('tiktok', '{video}', '{video/mp4,video/quicktime,video/webm}',
 '{"caption_max":2200,"video_max_seconds":600,"file_max_mb":512,"privacy_options":["PUBLIC_TO_EVERYONE","MUTUAL_FOLLOW_FRIENDS","SELF_ONLY"]}',
 '{video.publish,video.upload}', '{"per_hour":6}'),
('snapchat', '{image,video}', '{image/jpeg,image/png,video/mp4}',
 '{"caption_max":250,"video_max_seconds":180,"file_max_mb":300}',
 '{snapchat-marketing-api}', '{"per_hour":10}');

-- ============ POSTS ============
CREATE TYPE public.post_status AS ENUM
  ('draft','validating','queued','publishing','published','partially_published','failed','cancelled','requires_attention');
CREATE TYPE public.destination_status AS ENUM
  ('pending','validating','queued','uploading','processing','published','failed','retry_scheduled','cancelled','reconnect_required','rate_limited');

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  base_caption text NOT NULL DEFAULT '',
  base_description text NOT NULL DEFAULT '',
  base_hashtags text[] NOT NULL DEFAULT '{}',
  link_url text,
  post_type text NOT NULL DEFAULT 'image',
  status public.post_status NOT NULL DEFAULT 'draft',
  scheduled_at_utc timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace posts" ON public.social_posts
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Members create workspace posts" ON public.social_posts
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Members update workspace posts" ON public.social_posts
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumbnail_path text,
  media_type text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  width integer,
  height integer,
  duration_seconds numeric,
  aspect_ratio numeric,
  checksum text,
  original_filename text,
  alt_text text,
  processing_status text NOT NULL DEFAULT 'ready',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_media TO authenticated;
GRANT ALL ON public.social_post_media TO service_role;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace media" ON public.social_post_media
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members write workspace media" ON public.social_post_media
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update workspace media" ON public.social_post_media
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members delete workspace media" ON public.social_post_media
  FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE public.social_post_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_connections(id) ON DELETE SET NULL,
  platform text NOT NULL,
  account_label text,
  platform_caption text,
  platform_title text,
  platform_description text,
  platform_hashtags text[],
  platform_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  publish_status public.destination_status NOT NULL DEFAULT 'pending',
  provider_post_id text,
  provider_post_url text,
  provider_job_id text,
  error_code text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, social_account_id)
);
GRANT SELECT, INSERT, UPDATE ON public.social_post_destinations TO authenticated;
GRANT ALL ON public.social_post_destinations TO service_role;
ALTER TABLE public.social_post_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace destinations" ON public.social_post_destinations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Members create workspace destinations" ON public.social_post_destinations
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update workspace destinations" ON public.social_post_destinations
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER social_post_destinations_updated_at BEFORE UPDATE ON public.social_post_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX social_post_destinations_post_idx ON public.social_post_destinations (post_id);

-- ============ PUBLISHING JOBS ============
CREATE TABLE public.publishing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'publish_now',
  status public.post_status NOT NULL DEFAULT 'queued',
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE ON public.publishing_jobs TO authenticated;
GRANT ALL ON public.publishing_jobs TO service_role;
ALTER TABLE public.publishing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace jobs" ON public.publishing_jobs
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Members create workspace jobs" ON public.publishing_jobs
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update workspace jobs" ON public.publishing_jobs
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER publishing_jobs_updated_at BEFORE UPDATE ON public.publishing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.publishing_job_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publishing_job_id uuid NOT NULL REFERENCES public.publishing_jobs(id) ON DELETE CASCADE,
  social_post_destination_id uuid NOT NULL REFERENCES public.social_post_destinations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_connections(id) ON DELETE SET NULL,
  platform text NOT NULL,
  status public.destination_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  scheduled_for timestamptz,
  next_retry_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.publishing_job_destinations TO authenticated;
GRANT ALL ON public.publishing_job_destinations TO service_role;
ALTER TABLE public.publishing_job_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace job destinations" ON public.publishing_job_destinations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Members create workspace job destinations" ON public.publishing_job_destinations
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update workspace job destinations" ON public.publishing_job_destinations
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER publishing_job_destinations_updated_at BEFORE UPDATE ON public.publishing_job_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX publishing_job_destinations_due_idx
  ON public.publishing_job_destinations (status, scheduled_for, next_retry_at);

CREATE TABLE public.publishing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_destination_id uuid NOT NULL REFERENCES public.publishing_job_destinations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status public.destination_status NOT NULL DEFAULT 'pending',
  safe_request_payload jsonb,
  safe_provider_response jsonb,
  error_code text,
  error_message text,
  retryable boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.publishing_attempts TO authenticated;
GRANT ALL ON public.publishing_attempts TO service_role;
ALTER TABLE public.publishing_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace attempts" ON public.publishing_attempts
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE INDEX publishing_attempts_dest_idx ON public.publishing_attempts (job_destination_id, attempt_number);

-- ============ RATE LIMITS / NOTIFICATIONS / ACCOUNT EVENTS ============
CREATE TABLE public.provider_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_connections(id) ON DELETE CASCADE,
  bucket_key text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  request_limit integer NOT NULL DEFAULT 60,
  resets_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_key)
);
GRANT SELECT ON public.provider_rate_limits TO authenticated;
GRANT ALL ON public.provider_rate_limits TO service_role;
ALTER TABLE public.provider_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read rate limits" ON public.provider_rate_limits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE TRIGGER provider_rate_limits_updated_at BEFORE UPDATE ON public.provider_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  social_account_id uuid REFERENCES public.social_connections(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update their notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE public.social_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.social_account_events TO authenticated;
GRANT ALL ON public.social_account_events TO service_role;
ALTER TABLE public.social_account_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read account events" ON public.social_account_events
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));

-- ============ RUNNER CLAIM (row locking, no double publish) ============
CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
RETURNS SETOF public.publishing_job_destinations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM public.publishing_job_destinations d
    JOIN public.platform_capabilities c ON c.platform = d.platform
    WHERE d.status IN ('pending','queued','retry_scheduled','rate_limited')
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
  SET locked_at = now(), locked_by = _worker, status = 'validating', updated_at = now()
  FROM due WHERE t.id = due.id
  RETURNING t.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_publishing_destinations(integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_publishing_destinations(integer, text) TO service_role;
