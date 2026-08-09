import { GENERIC_LOGIN_ERROR, GENERIC_SIGNUP_ERROR } from "@/lib/auth-policy";

export type AuthFailureKind =
  "invalid_credentials" | "validation" | "rate_limited" | "network" | "server" | "unknown";

export type SafeAuthError = {
  name: string;
  status: number | null;
  code: string | null;
  message: string;
};

function field(error: unknown, key: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as Record<string, unknown>)[key];
}

function safeMessage(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value ?? "Unknown authentication error");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(sb_(?:secret|publishable)_[A-Za-z0-9_-]+)\b/g, "[REDACTED_KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .slice(0, 500);
}

export function safeAuthError(error: unknown): SafeAuthError {
  const rawStatus = field(error, "status") ?? field(error, "statusCode");
  const status =
    typeof rawStatus === "number"
      ? rawStatus
      : typeof rawStatus === "string" && /^\d{3}$/.test(rawStatus)
        ? Number(rawStatus)
        : null;
  const rawCode = field(error, "code") ?? field(error, "error_code");
  return {
    name:
      typeof field(error, "name") === "string"
        ? String(field(error, "name"))
        : error instanceof Error
          ? error.name
          : "UnknownError",
    status,
    code: typeof rawCode === "string" ? rawCode.slice(0, 120) : null,
    message: safeMessage(field(error, "message") ?? error),
  };
}

export function classifyAuthError(error: unknown): AuthFailureKind {
  const detail = safeAuthError(error);
  const haystack = `${detail.name} ${detail.code ?? ""} ${detail.message}`.toLowerCase();

  if (detail.status === 429 || /rate.?limit|too many requests|over_.*rate_limit/.test(haystack)) {
    return "rate_limited";
  }
  if (
    /authretryablefetcherror|failed to fetch|fetch failed|network|timed? out|timeout|aborterror|econn|enotfound|dns/.test(
      haystack,
    )
  ) {
    return "network";
  }
  if (detail.status != null && detail.status >= 500) return "server";
  if (
    detail.status === 401 ||
    /invalid_credentials|invalid login credentials|email_not_confirmed|bad_jwt|session_not_found/.test(
      haystack,
    )
  ) {
    return "invalid_credentials";
  }
  if (detail.status === 400 || detail.status === 422) return "validation";
  return "unknown";
}

export function isAuthAvailabilityError(error: unknown): boolean {
  const kind = classifyAuthError(error);
  return kind === "network" || kind === "server";
}

export function authUserMessage(error: unknown, action: "login" | "signup" | "session"): string {
  const kind = classifyAuthError(error);
  if (kind === "rate_limited") return "Too many authentication attempts. Please try again shortly.";
  if (kind === "network") {
    return "Unable to reach the authentication service. Check your connection and try again.";
  }
  if (kind === "server") {
    return "Authentication service is temporarily unavailable. Please try again.";
  }
  if (action === "login") return GENERIC_LOGIN_ERROR;
  if (action === "signup") {
    const code = safeAuthError(error).code?.toLowerCase();
    if (code === "weak_password") return "Choose a stronger password and try again.";
    if (code === "email_address_invalid") return "Enter a valid email address and try again.";
    return GENERIC_SIGNUP_ERROR;
  }
  return kind === "invalid_credentials"
    ? "Your session is invalid or expired. Please sign in again."
    : "We could not verify your session. Please try again.";
}

export function logAuthFailure(context: string, error: unknown): void {
  console.error("[Supabase Auth failure]", {
    context,
    ...safeAuthError(error),
    kind: classifyAuthError(error),
  });
}
