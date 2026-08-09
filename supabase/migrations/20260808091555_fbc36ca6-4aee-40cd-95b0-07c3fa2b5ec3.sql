ALTER TABLE public.media_renders
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS output_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS source_size_bytes bigint;

CREATE INDEX IF NOT EXISTS media_renders_source_platform_idx
  ON public.media_renders (source_storage_path, platform, status);