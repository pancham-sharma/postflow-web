import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type DashboardRecentPost = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export type DashboardUpcomingPost = {
  id: string;
  title: string;
  status: string;
  scheduledAtUtc: string | null;
};

export type DashboardSummary = {
  connectedAccounts: number;
  needsReconnect: number;
  uploadedMedia: number;
  totalPosts: number;
  draftPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  failedPosts: number;
  postsNeedingAttention: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  recentPosts: DashboardRecentPost[];
  upcomingPosts: DashboardUpcomingPost[];
};

export const DEFAULT_STORAGE_LIMIT_BYTES = 10 * 1024 ** 3;

/** Auth middleware re-export keeps the functions module a thin wrapper. */
export const dashboardAuth = requireSupabaseAuth;

const safe = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Workspace-scoped aggregation. Every number comes from a counting query on the
 * source tables (RLS applies as the signed-in user), so a brand-new workspace
 * returns real zeros instead of placeholder values.
 */
export async function buildDashboardSummary(
  supabase: Client,
  userId: string,
): Promise<DashboardSummary> {
  const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
  const workspaceId = await resolveWorkspaceId(userId);

  type PostStatus = Database["public"]["Enums"]["post_status"];
  const postCount = (status: PostStatus) =>
    supabase
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", status);

  const [
    accountsRes,
    unhealthyRes,
    mediaRes,
    sizesRes,
    postMediaSizesRes,
    limitRes,
    totalRes,
    draftRes,
    queuedRes,
    publishedRes,
    failedRes,
    attentionRes,
    destAttentionRes,
    recentRes,
    upcomingRes,
  ] = await Promise.all([
    supabase
      .from("social_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("connection_status", "connected")
      .eq("publishing_enabled", true),
    supabase
      .from("social_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("connection_status", "connected"),
    supabase
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("media_assets")
      .select("storage_path, file_size")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("social_post_media")
      .select("storage_path, file_size")
      .eq("workspace_id", workspaceId)
      .limit(5000),
    supabase
      .from("workspace_storage")
      .select("storage_limit_bytes")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    postCount("draft"),
    postCount("queued"),
    postCount("published"),
    postCount("failed"),
    postCount("requires_attention"),
    supabase
      .from("social_post_destinations")
      .select("post_id")
      .eq("workspace_id", workspaceId)
      .in("publish_status", ["reconnect_required", "failed", "rate_limited"])
      .limit(2000),
    supabase
      .from("social_posts")
      .select("id, title, status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("social_posts")
      .select("id, title, status, scheduled_at_utc")
      .eq("workspace_id", workspaceId)
      .in("status", ["queued", "validating", "publishing"])
      .order("scheduled_at_utc", { ascending: true, nullsFirst: false })
      .limit(6),
  ]);

  const attentionPosts = new Set<string>();
  for (const row of destAttentionRes.data ?? []) attentionPosts.add(row.post_id);

  const usedByPath = new Map<string, number>();
  for (const row of sizesRes.data ?? []) usedByPath.set(row.storage_path, safe(Number(row.file_size)));
  for (const row of postMediaSizesRes.data ?? []) {
    if (!usedByPath.has(row.storage_path)) usedByPath.set(row.storage_path, safe(Number(row.file_size)));
  }
  const storageUsedBytes = [...usedByPath.values()].reduce((sum, size) => sum + size, 0);

  return {
    connectedAccounts: safe(accountsRes.count),
    needsReconnect: safe(unhealthyRes.count),
    uploadedMedia: safe(mediaRes.count),
    totalPosts: safe(totalRes.count),
    draftPosts: safe(draftRes.count),
    scheduledPosts: safe(queuedRes.count),
    publishedPosts: safe(publishedRes.count),
    failedPosts: safe(failedRes.count),
    postsNeedingAttention: safe(attentionRes.count) + attentionPosts.size,
    storageUsedBytes,
    storageLimitBytes: safe(Number(limitRes.data?.storage_limit_bytes)) || DEFAULT_STORAGE_LIMIT_BYTES,
    recentPosts: (recentRes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
    })),
    upcomingPosts: (upcomingRes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      scheduledAtUtc: row.scheduled_at_utc,
    })),
  };
}
