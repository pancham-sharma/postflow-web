ALTER TABLE public.publish_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.publish_job_events REPLICA IDENTITY FULL;
ALTER TABLE public.publishing_job_destinations REPLICA IDENTITY FULL;
ALTER TABLE public.social_post_destinations REPLICA IDENTITY FULL;
ALTER TABLE public.social_posts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.publish_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.publish_job_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;