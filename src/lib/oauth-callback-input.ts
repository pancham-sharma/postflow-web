// Pure parsing for the provider redirect. Database-backed state validation and
// one-time consumption happen in the callback route after this first check.

export type OAuthCallbackInput =
  | { ok: true; code: string; state: string }
  | { ok: false; reason: "provider_error"; providerError: string; providerErrorCode: string | null }
  | { ok: false; reason: "missing_code" | "missing_state" };

export function parseOAuthCallbackInput(params: URLSearchParams): OAuthCallbackInput {
  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) {
    return {
      ok: false,
      reason: "provider_error",
      providerError,
      providerErrorCode: params.get("error"),
    };
  }

  const code = params.get("code");
  if (!code) return { ok: false, reason: "missing_code" };
  const state = params.get("state");
  if (!state) return { ok: false, reason: "missing_state" };
  return { ok: true, code, state };
}
