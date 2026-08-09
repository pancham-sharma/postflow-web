CREATE TABLE public.post_platform_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  destination_id uuid REFERENCES public.social_post_destinations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  card_key text NOT NULL DEFAULT '',
  connected_account_id uuid REFERENCES public.social_connections(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  hook text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  short_description text NOT NULL DEFAULT '',
  hashtags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  call_to_action text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  first_comment text NOT NULL DEFAULT '',
  pinned_comment text NOT NULL DEFAULT '',
  overlay_text text NOT NULL DEFAULT '',
  destination_url text,
  location text NOT NULL DEFAULT '',
  thumbnail_url text,
  platform_settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_generated boolean NOT NULL DEFAULT false,
  manually_edited boolean NOT NULL DEFAULT false,
  validation_status text NOT NULL DEFAULT 'pending',
  publish_status text NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz,
  published_at timestamptz,
  external_post_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_platform_contents TO authenticated;
GRANT ALL ON public.post_platform_contents TO service_role;

ALTER TABLE public.post_platform_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read platform contents"
ON public.post_platform_contents FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members create platform contents"
ON public.post_platform_contents FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members update platform contents"
ON public.post_platform_contents FOR UPDATE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members delete platform contents"
ON public.post_platform_contents FOR DELETE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX post_platform_contents_post_idx ON public.post_platform_contents(post_id);
CREATE INDEX post_platform_contents_workspace_idx ON public.post_platform_contents(workspace_id);
CREATE UNIQUE INDEX post_platform_contents_dest_idx ON public.post_platform_contents(destination_id) WHERE destination_id IS NOT NULL;

CREATE TRIGGER post_platform_contents_updated_at
BEFORE UPDATE ON public.post_platform_contents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();