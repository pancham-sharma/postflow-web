-- Fresh-project additions that were present in the original live schema but
-- were missing from the forward migration chain, plus private storage buckets.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_caption text NOT NULL DEFAULT '',
  default_hashtags text NOT NULL DEFAULT '',
  default_post_time text NOT NULL DEFAULT '09:30',
  default_youtube_visibility text NOT NULL DEFAULT 'public',
  timezone text NOT NULL DEFAULT 'UTC',
  language text NOT NULL DEFAULT 'en',
  notify_published boolean NOT NULL DEFAULT true,
  notify_partial boolean NOT NULL DEFAULT true,
  notify_failed boolean NOT NULL DEFAULT true,
  notify_schedule_approaching boolean NOT NULL DEFAULT false,
  notify_account_expiring boolean NOT NULL DEFAULT true,
  notify_storage_limit boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own preferences" ON public.user_preferences;
CREATE POLICY "Users manage their own preferences"
  ON public.user_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_preferences_set_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_set_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.user_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ) || '''s workspace',
    NEW.id
  )
  RETURNING id INTO ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  false,
  536870912,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'music',
  'music',
  false,
  52428800,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Earlier migrations contained preview-specific worker URLs. A new project
-- must not call those stale deployments. Re-enable the cron job only after the
-- new POSTFLOW_APP_URL has been deployed and registered.
DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname LIKE 'postflow-publishing%'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
EXCEPTION
  WHEN undefined_table OR undefined_function THEN NULL;
END;
$$;
