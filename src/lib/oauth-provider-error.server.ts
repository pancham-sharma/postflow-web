// Server-only OAuth response handling. Provider responses can contain tokens,
// authorization codes, or client details, so this module reduces failures to a
// small, redacted diagnostic before anything is logged or thrown.

export type OAuthFailureStage =
  | "authorization_response"
  | "token_exchange"
  | "token_upgrade"
  | "account_discovery"
  | "connection_storage";

export type OAuthFailureDetails = {
  platform: string;
  stage: OAuthFailureStage;
  endpoint: string;
  status: number | null;
  errorType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type OAuthRequestContext = Pick<OAuthFailureDetails, "platform" | "stage" | "endpoint">;

const SECRET_VALUE =
  /\b(?:access|refresh|id|client)[_-]?token\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi;
const SECRET_FIELD =
  /\b(?:client[_-]?secret|code(?:[_-]?verifier)?|authorization)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi;
const LONG_CREDENTIAL = /\b[A-Za-z0-9_-]{40,}\b/g;

function redacted(value: string): string {
  return value
    .replace(
      SECRET_VALUE,
      (match) => `${match.slice(0, match.indexOf("=") + 1) || "credential="}[redacted]`,
    )
    .replace(
      SECRET_FIELD,
      (match) => `${match.slice(0, match.indexOf("=") + 1) || "credential="}[redacted]`,
    )
    .replace(LONG_CREDENTIAL, "[redacted]")
    .trim()
    .slice(0, 300);
}

function asScalar(value: unknown): string | null {
  if (typeof value === "string") return redacted(value) || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function endpointName(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0] ?? "provider endpoint";
  }
}

/** Extracts only safe error fields from an OAuth provider response. */
export function oauthFailureDetails(
  context: OAuthRequestContext,
  status: number | null,
  payload: unknown,
): OAuthFailureDetails {
  const root = record(payload);
  const nested = record(root?.error) ?? record(root?.data) ?? root;
  return {
    platform: context.platform,
    stage: context.stage,
    endpoint: endpointName(context.endpoint),
    status,
    errorType: asScalar(nested?.error_type ?? nested?.type),
    errorCode: asScalar(nested?.error_code ?? nested?.code ?? nested?.error_subcode),
    errorMessage: asScalar(
      nested?.error_message ?? nested?.error_description ?? nested?.message ?? root?.message,
    ),
  };
}

export class OAuthProviderError extends Error {
  readonly details: OAuthFailureDetails;

  constructor(details: OAuthFailureDetails) {
    const stage = details.stage.replace(/_/g, " ");
    super(`${details.platform} OAuth ${stage} failed`);
    this.name = "OAuthProviderError";
    this.details = details;
  }
}

function logFailure(details: OAuthFailureDetails) {
  console.error(`[oauth:${details.platform}] ${details.stage} failed`, details);
}

/**
 * Parses a JSON OAuth response or throws a redacted, structured error. It is
 * used for both token operations and account discovery so UI messaging never
 * mislabels one stage as another.
 */
export async function oauthJsonOrThrow<T = unknown>(
  response: Response,
  context: OAuthRequestContext,
): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    const details = oauthFailureDetails(context, response.status, {
      error_type: "malformed_provider_response",
      error_message: "The provider returned a non-JSON OAuth response.",
    });
    logFailure(details);
    throw new OAuthProviderError(details);
  }

  if (!response.ok) {
    const details = oauthFailureDetails(context, response.status, payload);
    logFailure(details);
    throw new OAuthProviderError(details);
  }
  return payload as T;
}

/** Converts a transport failure into the same safe OAuth diagnostic shape. */
export function oauthTransportError(context: OAuthRequestContext): OAuthProviderError {
  const details = oauthFailureDetails(context, null, {
    error_type: "network_error",
    error_message: "The provider could not be reached.",
  });
  logFailure(details);
  return new OAuthProviderError(details);
}
