// Maps raw provider/OAuth failures onto safe, user-facing PostFlow messages.
// Never surface stack traces, tokens, secrets or provider payloads to the browser.

export type OAuthErrorCode =
  | "invalid_configuration"
  | "configuration_missing"
  | "invalid_platform_app"
  | "invalid_scope"
  | "access_denied"
  | "account_not_professional"
  | "state_expired"
  | "state_reused"
  | "app_review_required"
  | "app_not_found"
  | "redirect_uri_mismatch"
  | "permission_denied"
  | "app_not_approved"
  | "code_expired"
  | "token_exchange_failed"
  | "state_invalid"
  | "unknown";

export const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  configuration_missing: "Instagram connection is not configured.",
  invalid_platform_app:
    "The configured Instagram App ID is not enabled for Instagram API with Instagram Login.",
  invalid_scope:
    "The Instagram authorization request contains an unsupported permission.",
  access_denied: "Instagram authorization was cancelled or denied.",
  account_not_professional:
    "Switch this Instagram account to Business or Creator before connecting it.",
  state_expired: "The Instagram connection request expired. Start again.",
  state_reused: "This Instagram authorization request has already been used.",
  app_review_required:
    "The Instagram app requires tester access or Meta approval before this account can connect.",
  invalid_configuration:
    "This platform connection is not configured yet. Add the real app ID and app secret in backend secrets.",
  app_not_found:
    "The platform could not find the configured developer application. Check the app ID and that the app is active.",
  redirect_uri_mismatch:
    "The callback URL does not match the URL registered for this app.",
  permission_denied: "Authorization was cancelled or denied.",
  app_not_approved:
    "This developer application is not approved for the requested API access yet.",
  code_expired:
    "The authorization expired before it could be completed. Start the connection again.",
  token_exchange_failed:
    "Authorization could not be completed. Please try again.",
  state_invalid: "This authorization link expired. Try again.",
  unknown: "We couldn't complete the connection. Please try again.",
};

/** Classify a raw error/description string without leaking its contents. */
export function classifyOAuthError(raw: string | null | undefined): OAuthErrorCode {
  const text = (raw ?? "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("not eligible for api publishing") || text.includes("business or creator")) {
    return "account_not_professional";
  }
  if (text.includes("postflow_app_url")) return "configuration_missing";
  if (text.includes("not configured") || text.includes("placeholder")) {
    return "invalid_configuration";
  }
  if (text.includes("invalid platform app") || text.includes("invalid_platform_app")) {
    return "invalid_platform_app";
  }
  if (text.includes("invalid_scope") || text.includes("unsupported permission")) {
    return "invalid_scope";
  }
  if (text.includes("already been used") && text.includes("state")) return "state_reused";
  if (text.includes("tester") || text.includes("app review") || text.includes("app_review")) {
    return "app_review_required";
  }
  if (text.includes("couldn't find that app") || text.includes("could not find that app")) {
    return "app_not_found";
  }
  if (text.includes("invalid_client") || text.includes("unknown client")) return "app_not_found";
  if (text.includes("redirect_uri") || text.includes("redirect uri")) {
    return "redirect_uri_mismatch";
  }
  // Snapchat renders this on its own consent page when the client ID is not
  // valid for the request or the redirect URI is not registered on the app.
  if (
    text.includes("failed to load authorization data") ||
    text.includes("failed to load authorisation data")
  ) {
    return "redirect_uri_mismatch";
  }

  if (
    text.includes("access_denied") ||
    text.includes("denied") ||
    text.includes("cancel")
  ) {
    return "permission_denied";
  }
  if (text.includes("not approved") || text.includes("trial") || text.includes("scope")) {
    return "app_not_approved";
  }
  if (
    text.includes("expired") ||
    text.includes("invalid_grant") ||
    text.includes("already been used")
  ) {
    return "code_expired";
  }
  if (text.includes("token")) return "token_exchange_failed";
  if (text.includes("state")) return "state_invalid";
  return "unknown";
}

export function oauthErrorMessage(raw: string | null | undefined): string {
  return OAUTH_ERROR_MESSAGES[classifyOAuthError(raw)];
}
