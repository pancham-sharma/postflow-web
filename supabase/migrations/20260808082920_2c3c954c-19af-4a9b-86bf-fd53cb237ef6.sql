CREATE TABLE IF NOT EXISTS public.snapchat_public_profile_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  provider text NOT NULL DEFAULT 'snapchat_public_profile',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  public_profile_id text,
  public_profile_name text,
  available_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  public_profile_api_available boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  connection_status text NOT NULL DEFAULT 'connected',
  last_error_code text,
  last_verified_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snapchat_pp_user_unique UNIQUE (user_id)
);

GRANT SELECT ON public.snapchat_public_profile_connections TO authenticated;
GRANT ALL ON public.snapchat_public_profile_connections TO service_role;

ALTER TABLE public.snapchat_public_profile_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own snapchat public profile connection" ON public.snapchat_public_profile_connections;
CREATE POLICY "Users read their own snapchat public profile connection"
ON public.snapchat_public_profile_connections
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS snapchat_public_profile_connections_updated_at ON public.snapchat_public_profile_connections;
CREATE TRIGGER snapchat_public_profile_connections_updated_at
BEFORE UPDATE ON public.snapchat_public_profile_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.publishing_job_destinations
  ADD COLUMN IF NOT EXISTS snapchat_media_id text,
  ADD COLUMN IF NOT EXISTS snapchat_content_id text,
  ADD COLUMN IF NOT EXISTS snapchat_destination text,
  ADD COLUMN IF NOT EXISTS remote_status text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;