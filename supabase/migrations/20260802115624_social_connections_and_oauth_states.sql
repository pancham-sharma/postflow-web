-- Social connections + OAuth state storage

CREATE TABLE public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL,
  account_id text NOT NULL,
  account_name text NOT NULL,
  username text,
  avatar_url text,
  scopes text[] NOT NULL DEFAULT '{}',
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, account_id)
);

GRANT ALL ON public.social_connections TO service_role;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  code_verifier text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX social_connections_user_idx ON public.social_connections (user_id);
CREATE INDEX oauth_states_created_idx ON public.oauth_states (created_at);
