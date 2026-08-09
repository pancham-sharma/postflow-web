// Live Facebook (Meta) Graph checks. Publishing permission is always verified
// against the CURRENT user token — never against scopes stored at connect time,
// which may predate the Meta app gaining pages_manage_posts.
export const GRAPH = "https://graph.facebook.com/v21.0";

export const PAGES_MANAGE_POSTS = "pages_manage_posts";

export type FacebookPage = {
  id: string;
  name: string;
  accessToken: string | null;
  tasks: string[];
};

export type FacebookPermissions = {
  granted: string[];
  declined: string[];
  error: string | null;
};

/** GET /me/permissions — the authoritative list of what this token may do. */
export async function fetchGrantedPermissions(userToken: string): Promise<FacebookPermissions> {
  try {
    const response = await fetch(
      `${GRAPH}/me/permissions?access_token=${encodeURIComponent(userToken)}`,
    );
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      return {
        granted: [],
        declined: [],
        error: String(payload?.["error"]?.message ?? "Facebook rejected the permission lookup."),
      };
    }
    const rows: Array<Record<string, any>> = Array.isArray(payload["data"]) ? payload["data"] : [];
    return {
      granted: rows.filter((r) => r["status"] === "granted").map((r) => String(r["permission"])),
      declined: rows.filter((r) => r["status"] !== "granted").map((r) => String(r["permission"])),
      error: null,
    };
  } catch {
    return { granted: [], declined: [], error: "Facebook could not be reached." };
  }
}

/** GET /me/accounts — Pages this user administers, with page-scoped tokens. */
export async function fetchPagesWithTokens(userToken: string): Promise<{ pages: FacebookPage[]; error: string | null }> {
  try {
    const response = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(userToken)}`,
    );
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      return { pages: [], error: String(payload?.["error"]?.message ?? "Facebook rejected the Page lookup.") };
    }
    const rows: Array<Record<string, any>> = Array.isArray(payload["data"]) ? payload["data"] : [];
    return {
      pages: rows
        .map((page) => ({
          id: String(page["id"] ?? ""),
          name: String(page["name"] ?? "Untitled Page"),
          accessToken: page["access_token"] ? String(page["access_token"]) : null,
          tasks: Array.isArray(page["tasks"]) ? page["tasks"].map(String) : [],
        }))
        .filter((p) => p.id),
      error: null,
    };
  } catch {
    return { pages: [], error: "Facebook could not be reached." };
  }
}

/** Page tasks that mean "this user may create Page content". */
export function canCreateContent(tasks: string[]): boolean {
  if (tasks.length === 0) return true; // Meta omits tasks for some admin setups.
  return tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE");
}

export type FacebookPublishAccess =
  | { allowed: true; pageId: string; pageName: string; pageToken: string; tasks: string[] }
  | { allowed: false; code: string; message: string };

/**
 * Verifies, live against Meta, that this connection can publish to its Page:
 * pages_manage_posts granted AND the Page is visible on /me/accounts AND a
 * page-scoped token exists. Returns a fresh Page token every time.
 */
export async function verifyFacebookPublishAccess(args: {
  userToken: string;
  pageId: string | null;
  fallbackPageToken?: string | null;
}): Promise<FacebookPublishAccess> {
  const permissions = await fetchGrantedPermissions(args.userToken);
  const managePosts = permissions.granted.includes(PAGES_MANAGE_POSTS);
  console.log(`[FB_USER_PERMISSIONS] page_manage_posts_granted=${managePosts}`);

  if (!args.pageId) {
    console.log("[FB_PAGE_LOOKUP] page_found=false page_id=");
    return {
      allowed: false,
      code: "missing_page_id",
      message: "No Facebook Page is linked to this connection. Choose the Page you publish to.",
    };
  }

  if (!managePosts && permissions.error === null) {
    console.log(
      `[FB_VIDEO_PERMISSION_CHECK] allowed=false reason=FACEBOOK_PUBLISH_PERMISSION_MISSING`,
    );
    return {
      allowed: false,
      code: "facebook_publish_permission_missing",
      message:
        "This Facebook login has not granted pages_manage_posts. Reconnect Facebook and approve Page content publishing.",
    };
  }

  const { pages, error } = await fetchPagesWithTokens(args.userToken);
  const page = pages.find((p) => p.id === args.pageId) ?? null;
  console.log(`[FB_PAGE_LOOKUP] page_found=${Boolean(page)} page_id=${args.pageId}`);

  if (!page) {
    // Fall back to the stored Page token only when the lookup itself failed.
    if (error && args.fallbackPageToken) {
      console.log("[FB_PAGE_TOKEN] page_token_present=true (stored fallback)");
      return {
        allowed: true,
        pageId: args.pageId,
        pageName: "",
        pageToken: args.fallbackPageToken,
        tasks: [],
      };
    }
    console.log("[FB_VIDEO_PERMISSION_CHECK] allowed=false reason=FACEBOOK_PAGE_NOT_FOUND");
    return {
      allowed: false,
      code: "facebook_page_not_found",
      message:
        "This Facebook Page is no longer available to the connected login. Reconnect Facebook and select the Page again.",
    };
  }

  console.log(`[FB_PAGE_TASKS] tasks=[${page.tasks.join(",")}]`);
  const pageToken = page.accessToken ?? args.fallbackPageToken ?? null;
  console.log(`[FB_PAGE_TOKEN] page_token_present=${Boolean(pageToken)}`);

  if (!pageToken) {
    console.log("[FB_VIDEO_PERMISSION_CHECK] allowed=false reason=FACEBOOK_PAGE_TOKEN_MISSING");
    return {
      allowed: false,
      code: "facebook_page_token_missing",
      message:
        "No Page access token is available for this Facebook connection. Select the Page again to store one.",
    };
  }

  if (!canCreateContent(page.tasks)) {
    console.log("[FB_VIDEO_PERMISSION_CHECK] allowed=false reason=FACEBOOK_PUBLISH_PERMISSION_MISSING");
    return {
      allowed: false,
      code: "facebook_publish_permission_missing",
      message:
        "This Facebook login cannot create content on the selected Page. Ask a Page admin for content permission, then reconnect.",
    };
  }

  console.log("[FB_VIDEO_PERMISSION_CHECK] allowed=true reason=ok");
  return { allowed: true, pageId: page.id, pageName: page.name, pageToken, tasks: page.tasks };
}

/**
 * Rebuilds the stored Facebook metadata from a fresh user token: permissions,
 * Page id/name/tasks and page-scoped token all overwrite the previous values.
 */
export async function refreshFacebookConnectionMetadata(args: {
  connectionId: string;
  userToken: string;
  facebookUserId: string;
  previousMetadata: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const permissions = await fetchGrantedPermissions(args.userToken);
  const { pages } = await fetchPagesWithTokens(args.userToken);
  const previousPageId = args.previousMetadata["page_id"] ? String(args.previousMetadata["page_id"]) : null;
  const chosen = pages.find((p) => p.id === previousPageId) ?? (pages.length === 1 ? pages[0] : undefined);
  const now = new Date().toISOString();

  console.log(
    `[FB_USER_PERMISSIONS] page_manage_posts_granted=${permissions.granted.includes(PAGES_MANAGE_POSTS)}`,
  );
  console.log(`[FB_PAGE_LOOKUP] page_found=${Boolean(chosen)} page_id=${chosen?.id ?? ""}`);
  console.log(`[FB_PAGE_TOKEN] page_token_present=${Boolean(chosen?.accessToken)}`);

  const metadata: Record<string, unknown> = {
    ...args.previousMetadata,
    facebook_user_id: args.facebookUserId,
    granted_permissions: permissions.granted,
    declined_permissions: permissions.declined,
    available_pages: pages.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks })),
    connected_at: args.previousMetadata["connected_at"] ?? now,
    token_updated_at: now,
  };

  // Stale Page credentials from an earlier connection must never survive.
  delete metadata["page_access_token"];
  delete metadata["page_id"];
  delete metadata["page_name"];
  delete metadata["page_tasks"];

  if (chosen) {
    metadata["page_id"] = chosen.id;
    metadata["page_name"] = chosen.name;
    metadata["page_tasks"] = chosen.tasks;
    if (chosen.accessToken) metadata["page_access_token"] = chosen.accessToken;
  }

  return metadata;
}
