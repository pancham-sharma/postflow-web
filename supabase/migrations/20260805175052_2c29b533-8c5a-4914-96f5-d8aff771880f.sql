CREATE TABLE public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'postflow_library',
  title text NOT NULL,
  artist text NOT NULL DEFAULT '',
  audio_path text,
  audio_url text,
  cover_url text,
  genre text NOT NULL DEFAULT '',
  mood text NOT NULL DEFAULT '',
  duration_seconds numeric NOT NULL DEFAULT 0,
  licence_type text NOT NULL DEFAULT 'unknown',
  licence_name text NOT NULL DEFAULT '',
  commercial_use boolean NOT NULL DEFAULT false,
  monetization_allowed boolean NOT NULL DEFAULT false,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text NOT NULL DEFAULT '',
  allowed_platforms text[] NOT NULL DEFAULT '{}',
  licence_url text,
  licence_proof_path text,
  licence_acquired_at date,
  licence_expires_at date,
  status text NOT NULL DEFAULT 'active',
  uploaded_by uuid,
  ownership_confirmed_at timestamptz,
  original_filename text,
  file_hash text,
  usage_rights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_tracks TO authenticated;
GRANT ALL ON public.music_tracks TO service_role;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read the shared library"
  ON public.music_tracks FOR SELECT TO authenticated
  USING (workspace_id IS NULL AND status = 'active');

CREATE POLICY "Members read their workspace tracks"
  ON public.music_tracks FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins read every track"
  ON public.music_tracks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members add workspace tracks"
  ON public.music_tracks FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Admins add library tracks"
  ON public.music_tracks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members edit their own workspace tracks"
  ON public.music_tracks FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND (uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id, auth.uid()))
  )
  WITH CHECK (workspace_id IS NOT NULL);

CREATE POLICY "Admins edit every track"
  ON public.music_tracks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (true);

CREATE POLICY "Members delete their own workspace tracks"
  ON public.music_tracks FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND (uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id, auth.uid()))
  );

CREATE POLICY "Admins delete library tracks"
  ON public.music_tracks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER music_tracks_updated_at BEFORE UPDATE ON public.music_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX music_tracks_workspace_idx ON public.music_tracks (workspace_id, status);

CREATE TABLE public.media_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  source_storage_path text NOT NULL,
  output_storage_path text,
  platform text,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE SET NULL,
  mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.media_renders TO authenticated;
GRANT ALL ON public.media_renders TO service_role;
ALTER TABLE public.media_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace renders"
  ON public.media_renders FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members create workspace renders"
  ON public.media_renders FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());

CREATE TRIGGER media_renders_updated_at BEFORE UPDATE ON public.media_renders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();