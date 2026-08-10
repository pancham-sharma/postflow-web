// Single source of truth for the Facebook (Meta) OAuth scope list.
//
// `pages_manage_posts` is an advanced permission that must be enabled for the
// Meta app before it can be requested — asking for it while it is unavailable
// makes the login dialog fail with "Invalid Scopes: pages_manage_posts".
// It is therefore opt-in via the META_PAGES_MANAGE_POSTS_AVAILABLE secret and
// is added back automatically once Meta enables it for the app.

const BASE_FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export const PAGES_MANAGE_POSTS = "pages_manage_posts";

/** True only when the Meta app is known to have the advanced permission. */
export function pagesManagePostsAvailable(): boolean {
  const raw = (process.env["META_PAGES_MANAGE_POSTS_AVAILABLE"] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Scopes requested in the Facebook OAuth authorization URL. */
export function facebookOAuthScopes(): string[] {
  const scopes = pagesManagePostsAvailable()
    ? [...BASE_FACEBOOK_SCOPES, PAGES_MANAGE_POSTS]
    : [...BASE_FACEBOOK_SCOPES];
  // Defensive: never let the advanced permission leak into the login dialog
  // while it is unavailable, whatever the caller passed around.
  return pagesManagePostsAvailable()
    ? scopes
    : scopes.filter((scope) => scope !== PAGES_MANAGE_POSTS);
}

/** Comma-joined scope string used in the authorization URL. */
export function facebookOAuthScopeString(): string {
  return facebookOAuthScopes().join(",");
}

/** Temporary debug payload (no secrets, tokens or codes). */
export function facebookOAuthDebugPayload() {
  return {
    provider: "facebook" as const,
    flow: "facebook_login_for_business" as const,
    scopes: [],
    configurationIdEnv: "FACEBOOK_CONFIGURATION_ID",
    permissionsConfiguredInMeta: [...BASE_FACEBOOK_SCOPES, PAGES_MANAGE_POSTS],
  };
}
