ALTER TABLE public.publish_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.publish_job_events REPLICA IDENTITY FULL;
ALTER TABLE public.social_connections REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.publish_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.publish_job_events;
