SELECT cron.unschedule('postflow-publishing-runner') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'postflow-publishing-runner');

SELECT cron.unschedule('postflow-publishing-runner-dev') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'postflow-publishing-runner-dev');

-- The publishing runner is configured after deployment, when the canonical
-- POSTFLOW_APP_URL and a current publishable key are available. Do not embed
-- preview URLs or API keys in a version-controlled migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'social_connections') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_connections;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'media_assets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.media_assets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'media_renders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.media_renders;
  END IF;
END $$;
