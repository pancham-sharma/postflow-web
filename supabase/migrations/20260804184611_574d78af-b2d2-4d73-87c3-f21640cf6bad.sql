ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS state_hash text,
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS return_path text,
  ADD COLUMN IF NOT EXISTS existing_account_id text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

ALTER TABLE public.oauth_states ALTER COLUMN code_verifier DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS oauth_states_state_hash_key ON public.oauth_states (state_hash);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states (expires_at);

DELETE FROM public.social_connections a
USING public.social_connections b
WHERE a.workspace_id = b.workspace_id
  AND a.platform = b.platform
  AND a.account_id = b.account_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS social_connections_workspace_platform_account_key
  ON public.social_connections (workspace_id, platform, account_id);