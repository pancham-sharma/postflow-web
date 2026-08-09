GRANT INSERT ON public.publish_job_events TO authenticated;

CREATE POLICY "Users can add events to their own jobs" ON public.publish_job_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.publish_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()));
