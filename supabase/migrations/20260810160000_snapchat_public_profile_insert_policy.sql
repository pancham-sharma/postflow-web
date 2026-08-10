-- OAuth callback writes are performed with the backend-only service client,
-- which bypasses RLS. This narrowly scoped policy also makes an authenticated
-- user-side insert safe if that path is ever used: the owner cannot be forged
-- and the workspace must belong to the same user.
GRANT INSERT ON public.snapchat_public_profile_connections TO authenticated;

DROP POLICY IF EXISTS "Users insert their own snapchat public profile connection"
  ON public.snapchat_public_profile_connections;
CREATE POLICY "Users insert their own snapchat public profile connection"
ON public.snapchat_public_profile_connections
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members member
      WHERE member.workspace_id = snapchat_public_profile_connections.workspace_id
        AND member.user_id = auth.uid()
    )
  )
);
