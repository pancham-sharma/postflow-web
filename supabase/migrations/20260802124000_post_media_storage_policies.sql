CREATE POLICY "Users read own post media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own post media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own post media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own post media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
