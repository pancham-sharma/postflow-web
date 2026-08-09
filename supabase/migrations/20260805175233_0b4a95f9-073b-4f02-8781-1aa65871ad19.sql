CREATE POLICY "Users read own music files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'music' AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users upload own music files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'music' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own music files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'music' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own music files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'music' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO public.music_tracks
  (workspace_id, source, title, artist, audio_url, genre, mood, duration_seconds,
   licence_type, licence_name, commercial_use, monetization_allowed, attribution_required,
   attribution_text, allowed_platforms, licence_url, licence_acquired_at, status)
VALUES
  (NULL, 'public_domain', 'Morning Mood (Peer Gynt Suite No. 1)', 'Musopen Symphony Orchestra',
   'https://upload.wikimedia.org/wikipedia/commons/c/c2/Grieg_-_Peer_Gynt_Suite_No._1%2C_Op._46_-_I._Morning_Mood_%28Musopen_Symphony%29.flac',
   'Classical', 'Uplifting', 234, 'public_domain', 'Public domain (CC0)', true, true, false, '',
   ARRAY['instagram','facebook','pinterest','youtube','snapchat'],
   'https://creativecommons.org/publicdomain/zero/1.0/', CURRENT_DATE, 'active'),
  (NULL, 'public_domain', 'Maple Leaf Rag (1916 piano roll)', 'Scott Joplin',
   'https://upload.wikimedia.org/wikipedia/commons/e/e9/Maple_Leaf_Rag_-_played_by_Scott_Joplin_1916_sample.ogg',
   'Ragtime', 'Playful', 42, 'public_domain', 'Public domain', true, true, false, '',
   ARRAY['instagram','facebook','pinterest','youtube','snapchat'],
   'https://commons.wikimedia.org/wiki/File:Maple_Leaf_Rag_-_played_by_Scott_Joplin_1916_sample.ogg', CURRENT_DATE, 'active'),
  (NULL, 'public_domain', 'Maple Leaf Rag (Strolling Strings)', 'United States Air Force Band',
   'https://upload.wikimedia.org/wikipedia/commons/5/57/Maple_Leaf_Rag_-_Strolling_Strings_-_United_States_Air_Force_Band.mp3',
   'Ragtime', 'Energetic', 168, 'public_domain', 'Public domain (US Government work)', true, true, false, '',
   ARRAY['instagram','facebook','pinterest','youtube','snapchat'],
   'https://commons.wikimedia.org/wiki/File:Maple_Leaf_Rag_-_Strolling_Strings_-_United_States_Air_Force_Band.mp3', CURRENT_DATE, 'active'),
  (NULL, 'creative_commons', 'Spring, Mvt. 1 Allegro (The Four Seasons)', 'John Harrison with the Wichita State University Chamber Players',
   'https://upload.wikimedia.org/wikipedia/commons/f/ff/Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga',
   'Classical', 'Bright', 210, 'cc_by_sa', 'Creative Commons Attribution-ShareAlike 3.0', true, true, true,
   'Music: Spring, Mvt. 1 Allegro by John Harrison with the Wichita State University Chamber Players — Licence: CC BY-SA 3.0 — Source: Wikimedia Commons',
   ARRAY['instagram','facebook','pinterest','youtube','snapchat'],
   'https://creativecommons.org/licenses/by-sa/3.0/', CURRENT_DATE, 'active'),
  (NULL, 'public_domain', 'Gymnopédie No. 1', 'Erik Satie (public-domain recording)',
   'https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg',
   'Classical', 'Calm', 195, 'public_domain', 'Public domain', true, true, false, '',
   ARRAY['instagram','facebook','pinterest','youtube','snapchat'],
   'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg', CURRENT_DATE, 'active');