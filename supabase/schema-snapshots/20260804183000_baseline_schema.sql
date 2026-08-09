-- Baseline schema migration (generated from the live database)
-- Captures all enums, tables, constraints, indexes, functions, triggers,
-- grants, row level security and policies for the public schema.

Output format is unaligned.
-- ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('admin', 'support', 'member');
CREATE TYPE public.destination_status AS ENUM ('pending', 'validating', 'queued', 'uploading', 'processing', 'published', 'failed', 'retry_scheduled', 'cancelled', 'reconnect_required', 'rate_limited');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE public.post_status AS ENUM ('draft', 'validating', 'queued', 'publishing', 'published', 'partially_published', 'failed', 'cancelled', 'requires_attention');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');

-- TABLES
CREATE TABLE IF NOT EXISTS public.admin_api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  description text,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  created_by uuid,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  rotated_at timestamp with time zone,
  last_used_at timestamp with time zone,
  last_used_ip text,
  request_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  folder_id uuid,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  media_type text DEFAULT 'image'::text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint DEFAULT 0 NOT NULL,
  width integer,
  height integer,
  duration_seconds numeric,
  aspect_ratio text,
  checksum text,
  alt_text text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  processing_status text DEFAULT 'ready'::text NOT NULL,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.media_folders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  social_account_id uuid,
  post_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text NOT NULL,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  code_verifier text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  state_hash text,
  workspace_id uuid,
  return_path text,
  existing_account_id text,
  expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
  consumed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.platform_capabilities (
  platform text NOT NULL,
  publishing_enabled boolean DEFAULT true NOT NULL,
  oauth_enabled boolean DEFAULT true NOT NULL,
  maintenance_mode boolean DEFAULT false NOT NULL,
  supported_post_types text[] DEFAULT '{}'::text[] NOT NULL,
  supported_media_types text[] DEFAULT '{}'::text[] NOT NULL,
  limits jsonb DEFAULT '{}'::jsonb NOT NULL,
  required_scopes text[] DEFAULT '{}'::text[] NOT NULL,
  rate_limit_config jsonb DEFAULT '{}'::jsonb NOT NULL,
  max_retries integer DEFAULT 5 NOT NULL,
  token_refresh_threshold_minutes integer DEFAULT 60 NOT NULL,
  notice text,
  internal_notice text,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.platform_controls (
  platform text NOT NULL,
  publishing_enabled boolean DEFAULT true NOT NULL,
  maintenance_mode boolean DEFAULT false NOT NULL,
  rate_limit_per_hour integer DEFAULT 60 NOT NULL,
  notice text,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.platform_health (
  platform text NOT NULL,
  sync_status text DEFAULT 'unknown'::text NOT NULL,
  last_webhook_at timestamp with time zone,
  last_poll_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_error_at timestamp with time zone,
  last_error_message text,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  failure_alert_threshold integer DEFAULT 3 NOT NULL,
  stale_sync_alert_minutes integer DEFAULT 60 NOT NULL,
  permission_expiry_alert_days integer DEFAULT 7 NOT NULL,
  alert_message text,
  checked_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  avatar_url text,
  is_suspended boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.provider_rate_limits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  platform text NOT NULL,
  workspace_id uuid,
  social_account_id uuid,
  bucket_key text NOT NULL,
  window_started_at timestamp with time zone DEFAULT now() NOT NULL,
  request_count integer DEFAULT 0 NOT NULL,
  request_limit integer DEFAULT 60 NOT NULL,
  resets_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.publish_job_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  status job_status DEFAULT 'queued'::job_status NOT NULL,
  request_payload jsonb,
  provider_response jsonb,
  error_code text,
  error_message text,
  backoff_seconds integer,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.publish_job_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  attempt_number integer,
  kind text NOT NULL,
  message text NOT NULL,
  detail jsonb,
  actor_id uuid,
  actor_email text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.publish_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  post_title text NOT NULL,
  status job_status DEFAULT 'queued'::job_status NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 3 NOT NULL,
  error_code text,
  error_message text,
  provider_response jsonb,
  scheduled_for timestamp with time zone,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  request_payload jsonb,
  next_retry_at timestamp with time zone,
  workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.publishing_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_destination_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  status destination_status DEFAULT 'pending'::destination_status NOT NULL,
  safe_request_payload jsonb,
  safe_provider_response jsonb,
  error_code text,
  error_message text,
  retryable boolean DEFAULT false NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_ms integer,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.publishing_job_destinations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  publishing_job_id uuid NOT NULL,
  social_post_destination_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  social_account_id uuid,
  platform text NOT NULL,
  status destination_status DEFAULT 'pending'::destination_status NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 5 NOT NULL,
  scheduled_for timestamp with time zone,
  next_retry_at timestamp with time zone,
  locked_at timestamp with time zone,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.publishing_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  post_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  job_type text DEFAULT 'publish_now'::text NOT NULL,
  status post_status DEFAULT 'queued'::post_status NOT NULL,
  scheduled_for timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  idempotency_key text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.social_account_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  social_account_id uuid,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.social_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  account_id text NOT NULL,
  account_name text NOT NULL,
  username text,
  avatar_url text,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  token_expires_at timestamp with time zone,
  last_sync_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  workspace_id uuid NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  publishing_enabled boolean DEFAULT true NOT NULL,
  publishing_eligible boolean DEFAULT true NOT NULL,
  account_type text,
  connection_status text DEFAULT 'connected'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_refresh_at timestamp with time zone,
  last_refresh_error text,
  refresh_failure_count integer DEFAULT 0 NOT NULL,
  last_successful_publish_at timestamp with time zone,
  disconnected_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.social_post_destinations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  post_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  social_account_id uuid,
  platform text NOT NULL,
  account_label text,
  platform_caption text,
  platform_title text,
  platform_description text,
  platform_hashtags text[],
  platform_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  validation_status text DEFAULT 'pending'::text NOT NULL,
  validation_issues jsonb DEFAULT '[]'::jsonb NOT NULL,
  publish_status destination_status DEFAULT 'pending'::destination_status NOT NULL,
  provider_post_id text,
  provider_post_url text,
  provider_job_id text,
  error_code text,
  error_message text,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.social_post_media (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  post_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  storage_path text NOT NULL,
  thumbnail_path text,
  media_type text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint DEFAULT 0 NOT NULL,
  width integer,
  height integer,
  duration_seconds numeric,
  aspect_ratio numeric,
  checksum text,
  original_filename text,
  alt_text text,
  processing_status text DEFAULT 'ready'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  base_caption text DEFAULT ''::text NOT NULL,
  base_description text DEFAULT ''::text NOT NULL,
  base_hashtags text[] DEFAULT '{}'::text[] NOT NULL,
  link_url text,
  post_type text DEFAULT 'image'::text NOT NULL,
  status post_status DEFAULT 'draft'::post_status NOT NULL,
  scheduled_at_utc timestamp with time zone,
  timezone text DEFAULT 'UTC'::text NOT NULL,
  idempotency_key text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid NOT NULL,
  default_caption text DEFAULT ''::text NOT NULL,
  default_hashtags text DEFAULT ''::text NOT NULL,
  default_post_time text DEFAULT '09:30'::text NOT NULL,
  default_youtube_visibility text DEFAULT 'public'::text NOT NULL,
  timezone text DEFAULT 'UTC'::text NOT NULL,
  language text DEFAULT 'en'::text NOT NULL,
  notify_published boolean DEFAULT true NOT NULL,
  notify_partial boolean DEFAULT true NOT NULL,
  notify_failed boolean DEFAULT true NOT NULL,
  notify_schedule_approaching boolean DEFAULT false NOT NULL,
  notify_account_expiring boolean DEFAULT true NOT NULL,
  notify_storage_limit boolean DEFAULT true NOT NULL,
  notify_email boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role workspace_role DEFAULT 'member'::workspace_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.workspace_storage (
  workspace_id uuid NOT NULL,
  storage_limit_bytes bigint DEFAULT '10737418240'::bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- CONSTRAINTS
ALTER TABLE public.admin_api_keys ADD CONSTRAINT admin_api_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);
ALTER TABLE public.media_folders ADD CONSTRAINT media_folders_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.oauth_states ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (state);
ALTER TABLE public.platform_capabilities ADD CONSTRAINT platform_capabilities_pkey PRIMARY KEY (platform);
ALTER TABLE public.platform_controls ADD CONSTRAINT platform_controls_pkey PRIMARY KEY (platform);
ALTER TABLE public.platform_health ADD CONSTRAINT platform_health_pkey PRIMARY KEY (platform);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.provider_rate_limits ADD CONSTRAINT provider_rate_limits_pkey PRIMARY KEY (id);
ALTER TABLE public.publish_job_attempts ADD CONSTRAINT publish_job_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.publish_job_events ADD CONSTRAINT publish_job_events_pkey PRIMARY KEY (id);
ALTER TABLE public.publish_jobs ADD CONSTRAINT publish_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.publishing_attempts ADD CONSTRAINT publishing_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.publishing_job_destinations ADD CONSTRAINT publishing_job_destinations_pkey PRIMARY KEY (id);
ALTER TABLE public.publishing_jobs ADD CONSTRAINT publishing_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.social_account_events ADD CONSTRAINT social_account_events_pkey PRIMARY KEY (id);
ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.social_post_destinations ADD CONSTRAINT social_post_destinations_pkey PRIMARY KEY (id);
ALTER TABLE public.social_post_media ADD CONSTRAINT social_post_media_pkey PRIMARY KEY (id);
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_storage ADD CONSTRAINT workspace_storage_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_api_keys ADD CONSTRAINT admin_api_keys_key_prefix_key UNIQUE (key_prefix);
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_storage_path_key UNIQUE (storage_path);
ALTER TABLE public.media_folders ADD CONSTRAINT media_folders_workspace_id_name_key UNIQUE (workspace_id, name);
ALTER TABLE public.provider_rate_limits ADD CONSTRAINT provider_rate_limits_bucket_key_key UNIQUE (bucket_key);
ALTER TABLE public.publish_job_attempts ADD CONSTRAINT publish_job_attempts_job_id_attempt_number_key UNIQUE (job_id, attempt_number);
ALTER TABLE public.publishing_jobs ADD CONSTRAINT publishing_jobs_workspace_id_idempotency_key_key UNIQUE (workspace_id, idempotency_key);
ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_user_id_platform_account_id_key UNIQUE (user_id, platform, account_id);
ALTER TABLE public.social_post_destinations ADD CONSTRAINT social_post_destinations_post_id_social_account_id_key UNIQUE (post_id, social_account_id);
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_workspace_id_idempotency_key_key UNIQUE (workspace_id, idempotency_key);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);
ALTER TABLE public.admin_api_keys ADD CONSTRAINT admin_api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_api_keys ADD CONSTRAINT admin_api_keys_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.media_folders ADD CONSTRAINT media_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES social_connections(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.platform_controls ADD CONSTRAINT platform_controls_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.platform_health ADD CONSTRAINT platform_health_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.provider_rate_limits ADD CONSTRAINT provider_rate_limits_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES social_connections(id) ON DELETE CASCADE;
ALTER TABLE public.provider_rate_limits ADD CONSTRAINT provider_rate_limits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.publish_job_attempts ADD CONSTRAINT publish_job_attempts_job_id_fkey FOREIGN KEY (job_id) REFERENCES publish_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.publish_job_events ADD CONSTRAINT publish_job_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.publish_job_events ADD CONSTRAINT publish_job_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES publish_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.publish_jobs ADD CONSTRAINT publish_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.publish_jobs ADD CONSTRAINT publish_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_attempts ADD CONSTRAINT publishing_attempts_job_destination_id_fkey FOREIGN KEY (job_destination_id) REFERENCES publishing_job_destinations(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_attempts ADD CONSTRAINT publishing_attempts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_job_destinations ADD CONSTRAINT publishing_job_destinations_publishing_job_id_fkey FOREIGN KEY (publishing_job_id) REFERENCES publishing_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_job_destinations ADD CONSTRAINT publishing_job_destinations_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES social_connections(id) ON DELETE SET NULL;
ALTER TABLE public.publishing_job_destinations ADD CONSTRAINT publishing_job_destinations_social_post_destination_id_fkey FOREIGN KEY (social_post_destination_id) REFERENCES social_post_destinations(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_job_destinations ADD CONSTRAINT publishing_job_destinations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_jobs ADD CONSTRAINT publishing_jobs_post_id_fkey FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
ALTER TABLE public.publishing_jobs ADD CONSTRAINT publishing_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.social_account_events ADD CONSTRAINT social_account_events_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES social_connections(id) ON DELETE CASCADE;
ALTER TABLE public.social_account_events ADD CONSTRAINT social_account_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.social_post_destinations ADD CONSTRAINT social_post_destinations_post_id_fkey FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
ALTER TABLE public.social_post_destinations ADD CONSTRAINT social_post_destinations_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES social_connections(id) ON DELETE SET NULL;
ALTER TABLE public.social_post_destinations ADD CONSTRAINT social_post_destinations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.social_post_media ADD CONSTRAINT social_post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
ALTER TABLE public.social_post_media ADD CONSTRAINT social_post_media_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_storage ADD CONSTRAINT workspace_storage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- INDEXES
CREATE INDEX admin_api_keys_active_idx ON public.admin_api_keys USING btree (revoked_at, created_at DESC);
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs USING btree (created_at DESC);
CREATE INDEX idx_admin_audit_logs_created ON public.admin_audit_logs USING btree (created_at DESC);
CREATE INDEX media_assets_checksum_idx ON public.media_assets USING btree (workspace_id, checksum);
CREATE INDEX media_assets_folder_idx ON public.media_assets USING btree (folder_id);
CREATE INDEX media_assets_workspace_created_idx ON public.media_assets USING btree (workspace_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read_at, created_at DESC);
CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX oauth_states_created_idx ON public.oauth_states USING btree (created_at);
CREATE INDEX oauth_states_expires_at_idx ON public.oauth_states USING btree (expires_at);
CREATE UNIQUE INDEX oauth_states_state_hash_key ON public.oauth_states USING btree (state_hash);
CREATE INDEX idx_publish_job_attempts_job_num ON public.publish_job_attempts USING btree (job_id, attempt_number);
CREATE INDEX publish_job_attempts_job_idx ON public.publish_job_attempts USING btree (job_id, attempt_number);
CREATE INDEX idx_publish_job_events_job_time ON public.publish_job_events USING btree (job_id, occurred_at DESC);
CREATE INDEX publish_job_events_job_idx ON public.publish_job_events USING btree (job_id, occurred_at);
CREATE INDEX idx_publish_jobs_created_at_desc ON public.publish_jobs USING btree (created_at DESC);
CREATE INDEX idx_publish_jobs_platform_created ON public.publish_jobs USING btree (platform, created_at DESC);
CREATE INDEX idx_publish_jobs_status_created ON public.publish_jobs USING btree (status, created_at DESC);
CREATE INDEX idx_publish_jobs_user_created ON public.publish_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_publish_jobs_workspace_status ON public.publish_jobs USING btree (workspace_id, status);
CREATE INDEX publish_jobs_status_idx ON public.publish_jobs USING btree (status, created_at DESC);
CREATE INDEX publish_jobs_user_idx ON public.publish_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_publishing_attempts_dest ON public.publishing_attempts USING btree (job_destination_id, attempt_number);
CREATE INDEX publishing_attempts_dest_idx ON public.publishing_attempts USING btree (job_destination_id, attempt_number);
CREATE INDEX idx_pjd_due ON public.publishing_job_destinations USING btree (status, scheduled_for, next_retry_at);
CREATE INDEX idx_pjd_job ON public.publishing_job_destinations USING btree (publishing_job_id);
CREATE INDEX idx_pjd_workspace ON public.publishing_job_destinations USING btree (workspace_id, status);
CREATE INDEX publishing_job_destinations_due_idx ON public.publishing_job_destinations USING btree (status, scheduled_for, next_retry_at);
CREATE INDEX idx_social_connections_user ON public.social_connections USING btree (user_id);
CREATE INDEX idx_social_connections_workspace ON public.social_connections USING btree (workspace_id, platform);
CREATE INDEX social_connections_user_idx ON public.social_connections USING btree (user_id);
CREATE INDEX social_connections_workspace_idx ON public.social_connections USING btree (workspace_id, platform);
CREATE UNIQUE INDEX social_connections_workspace_platform_account_key ON public.social_connections USING btree (workspace_id, platform, account_id);
CREATE INDEX idx_social_post_destinations_post ON public.social_post_destinations USING btree (post_id);
CREATE INDEX social_post_destinations_post_idx ON public.social_post_destinations USING btree (post_id);
CREATE INDEX idx_social_post_media_post ON public.social_post_media USING btree (post_id, sort_order);
CREATE INDEX idx_social_posts_workspace_created ON public.social_posts USING btree (workspace_id, created_at DESC);
CREATE INDEX idx_workspace_members_user ON public.workspace_members USING btree (user_id, created_at);

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.claim_due_publishing_destinations(_limit integer, _worker text)
 RETURNS SETOF publishing_job_destinations
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
$function$
;
CREATE OR REPLACE FUNCTION public.default_workspace_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
                 WHERE workspace_id = _workspace_id AND user_id = _user_id
                   AND role IN ('owner','admin'))
$function$
;
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
                 WHERE workspace_id = _workspace_id AND user_id = _user_id)
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- TRIGGERS
CREATE TRIGGER admin_api_keys_set_updated_at BEFORE UPDATE ON public.admin_api_keys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER media_assets_updated_at BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER media_folders_updated_at BEFORE UPDATE ON public.media_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER platform_capabilities_updated_at BEFORE UPDATE ON public.platform_capabilities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER platform_controls_set_updated_at BEFORE UPDATE ON public.platform_controls FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER platform_health_set_updated_at BEFORE UPDATE ON public.platform_health FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER provider_rate_limits_updated_at BEFORE UPDATE ON public.provider_rate_limits FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER publish_jobs_set_updated_at BEFORE UPDATE ON public.publish_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER publishing_job_destinations_updated_at BEFORE UPDATE ON public.publishing_job_destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER publishing_jobs_updated_at BEFORE UPDATE ON public.publishing_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER social_post_destinations_updated_at BEFORE UPDATE ON public.social_post_destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workspace_storage_updated_at BEFORE UPDATE ON public.workspace_storage FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_api_keys TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_api_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_states TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_capabilities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_capabilities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_capabilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_controls TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_controls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_health TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_health TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_rate_limits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_rate_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_rate_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_attempts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_job_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_attempts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_job_destinations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_job_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_job_destinations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_account_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_account_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_account_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_destinations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_destinations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_media TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_storage TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_storage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO service_role;

-- RLS
ALTER TABLE public.admin_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_job_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_account_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Admins can read api keys" ON public.admin_api_keys AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can read the audit log" ON public.admin_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "members read media" ON public.media_assets AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members update media" ON public.media_assets AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_member(workspace_id, auth.uid())) WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members upload media" ON public.media_assets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_workspace_member(workspace_id, auth.uid()) AND (uploaded_by = auth.uid())));
CREATE POLICY "owner or admin delete media" ON public.media_assets AS PERMISSIVE FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR is_workspace_admin(workspace_id, auth.uid())));
CREATE POLICY "members create folders" ON public.media_folders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_workspace_member(workspace_id, auth.uid()) AND (created_by = auth.uid())));
CREATE POLICY "members delete folders" ON public.media_folders AS PERMISSIVE FOR DELETE TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members read folders" ON public.media_folders AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members update folders" ON public.media_folders AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_member(workspace_id, auth.uid())) WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Users read their notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users update their notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Admins can update capabilities" ON public.platform_capabilities AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Signed-in users can read capabilities" ON public.platform_capabilities AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update platform controls" ON public.platform_controls AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Signed-in users can read platform controls" ON public.platform_controls AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update platform health" ON public.platform_health AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Signed-in users can read platform health" ON public.platform_health AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Support can read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'support'::app_role));
CREATE POLICY "Users can read their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "Admins read rate limits" ON public.provider_rate_limits AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Admins and support can read job attempts" ON public.publish_job_attempts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Users can read attempts of their own jobs" ON public.publish_job_attempts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM publish_jobs j
  WHERE ((j.id = publish_job_attempts.job_id) AND (j.user_id = auth.uid())))));
CREATE POLICY "Admins and support can read job events" ON public.publish_job_events AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Users can add events to their own jobs" ON public.publish_job_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM publish_jobs j
  WHERE ((j.id = publish_job_events.job_id) AND (j.user_id = auth.uid())))));
CREATE POLICY "Users can read events of their own jobs" ON public.publish_job_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM publish_jobs j
  WHERE ((j.id = publish_job_events.job_id) AND (j.user_id = auth.uid())))));
CREATE POLICY "Admins and support can read all jobs" ON public.publish_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Admins can update any job" ON public.publish_jobs AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create their own jobs" ON public.publish_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read their own jobs" ON public.publish_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Members read workspace attempts" ON public.publishing_attempts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members create workspace job destinations" ON public.publishing_job_destinations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members read workspace job destinations" ON public.publishing_job_destinations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members update workspace job destinations" ON public.publishing_job_destinations AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Members create workspace jobs" ON public.publishing_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members read workspace jobs" ON public.publishing_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members update workspace jobs" ON public.publishing_jobs AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Members read account events" ON public.social_account_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members create workspace destinations" ON public.social_post_destinations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members read workspace destinations" ON public.social_post_destinations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members update workspace destinations" ON public.social_post_destinations AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_member(workspace_id, auth.uid())) WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members delete workspace media" ON public.social_post_media AS PERMISSIVE FOR DELETE TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members read workspace media" ON public.social_post_media AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update workspace media" ON public.social_post_media AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_member(workspace_id, auth.uid())) WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members write workspace media" ON public.social_post_media AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members create workspace posts" ON public.social_posts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_workspace_member(workspace_id, auth.uid()) AND (created_by = auth.uid())));
CREATE POLICY "Members read workspace posts" ON public.social_posts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'support'::app_role)));
CREATE POLICY "Members update workspace posts" ON public.social_posts AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_member(workspace_id, auth.uid())) WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Users manage their own preferences" ON public.user_preferences AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins can grant roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can read all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can revoke roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can read their own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Members can read workspace membership" ON public.workspace_members AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can add members" ON public.workspace_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can remove members" ON public.workspace_members AS PERMISSIVE FOR DELETE TO authenticated USING (is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "Workspace admins can update members" ON public.workspace_members AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_admin(workspace_id, auth.uid())) WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY "admins manage storage limit" ON public.workspace_storage AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "members read storage limit" ON public.workspace_storage AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can read their workspaces" ON public.workspaces AS PERMISSIVE FOR SELECT TO authenticated USING (is_workspace_member(id, auth.uid()));
CREATE POLICY "Users can create workspaces" ON public.workspaces AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Workspace admins can update" ON public.workspaces AS PERMISSIVE FOR UPDATE TO authenticated USING (is_workspace_admin(id, auth.uid())) WITH CHECK (is_workspace_admin(id, auth.uid()));
