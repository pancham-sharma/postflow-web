-- ============ MEDIA LIBRARY ============
CREATE TABLE public.media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO authenticated;
GRANT ALL ON public.media_folders TO service_role;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read folders" ON public.media_folders FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members create folders" ON public.media_folders FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "members update folders" ON public.media_folders FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members delete folders" ON public.media_folders FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  width integer,
  height integer,
  duration_seconds numeric,
  aspect_ratio text,
  checksum text,
  alt_text text,
  tags text[] NOT NULL DEFAULT '{}',
  processing_status text NOT NULL DEFAULT 'ready',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read media" ON public.media_assets FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members upload media" ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "members update media" ON public.media_assets FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "owner or admin delete media" ON public.media_assets FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id, auth.uid()));
CREATE INDEX media_assets_workspace_created_idx ON public.media_assets (workspace_id, created_at DESC);
CREATE INDEX media_assets_folder_idx ON public.media_assets (folder_id);
CREATE INDEX media_assets_checksum_idx ON public.media_assets (workspace_id, checksum);

CREATE TABLE public.workspace_storage (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_limit_bytes bigint NOT NULL DEFAULT 10737418240,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_storage TO authenticated;
GRANT ALL ON public.workspace_storage TO service_role;
ALTER TABLE public.workspace_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read storage limit" ON public.workspace_storage FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "admins manage storage limit" ON public.workspace_storage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER media_folders_updated_at BEFORE UPDATE ON public.media_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER media_assets_updated_at BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER workspace_storage_updated_at BEFORE UPDATE ON public.workspace_storage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
