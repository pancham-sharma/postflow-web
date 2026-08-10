import assert from "node:assert/strict";
import test from "node:test";
import {
  OAuthProviderError,
  oauthJsonOrThrow,
  oauthTransportError,
} from "./oauth-provider-error.server.ts";
import { parseOAuthCallbackInput } from "./oauth-callback-input.ts";

const instagramTokenExchange = {
  platform: "instagram",
  stage: "token_exchange" as const,
  endpoint: "https://api.instagram.com/oauth/access_token",
};

test("accepts a successful Instagram OAuth token response", async () => {
  const response = new Response(
    JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
    { status: 200 },
  );
  const payload = await oauthJsonOrThrow<{ access_token: string; expires_in: number }>(
    response,
    instagramTokenExchange,
  );
  assert.equal(payload.access_token, "test-token");
  assert.equal(payload.expires_in, 3600);
});

test("keeps provider token-exchange failures structured and redacted", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(
      () =>
        oauthJsonOrThrow(
          new Response(
            JSON.stringify({
              error: {
                type: "OAuthException",
                code: 190,
                message:
                  "Invalid access token: access_token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
              },
            }),
            { status: 400 },
          ),
          instagramTokenExchange,
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthProviderError);
        assert.equal(error.details.status, 400);
        assert.equal(error.details.errorType, "OAuthException");
        assert.equal(error.details.errorCode, "190");
        assert.match(error.details.errorMessage ?? "", /\[redacted\]/);
        assert.doesNotMatch(error.details.errorMessage ?? "", /abcdefghijklmnopqrstuvwxyz/);
        return true;
      },
    );
  } finally {
    console.error = originalError;
  }
});

test("flags malformed provider responses without exposing their body", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(
      () =>
        oauthJsonOrThrow(
          new Response(
            "not-json access_token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            {
              status: 502,
            },
          ),
          instagramTokenExchange,
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthProviderError);
        assert.equal(error.details.errorType, "malformed_provider_response");
        assert.doesNotMatch(error.message, /abcdefghijklmnopqrstuvwxyz/);
        return true;
      },
    );
  } finally {
    console.error = originalError;
  }
});

test("normalizes provider transport failures", () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const error = oauthTransportError(instagramTokenExchange);
    assert.equal(error.details.status, null);
    assert.equal(error.details.errorType, "network_error");
  } finally {
    console.error = originalError;
  }
});

test("parses a successful callback without modifying the authorization code", () => {
  const result = parseOAuthCallbackInput(
    new URLSearchParams({ code: "A%2Bprovider-code", state: "single-use-state" }),
  );
  assert.deepEqual(result, { ok: true, code: "A%2Bprovider-code", state: "single-use-state" });
});

test("rejects missing callback values and handles provider authorization errors", () => {
  assert.deepEqual(parseOAuthCallbackInput(new URLSearchParams({ state: "state" })), {
    ok: false,
    reason: "missing_code",
  });
  assert.deepEqual(parseOAuthCallbackInput(new URLSearchParams({ code: "code" })), {
    ok: false,
    reason: "missing_state",
  });
  assert.deepEqual(
    parseOAuthCallbackInput(
      new URLSearchParams({ error: "access_denied", error_description: "User cancelled" }),
    ),
    {
      ok: false,
      reason: "provider_error",
      providerError: "User cancelled",
      providerErrorCode: "access_denied",
    },
  );
});

test("builds Facebook Login for Business authorization parameters", async () => {
  const { facebookBusinessAuthorizeParams } = await import("./facebook-oauth-config.ts");
  assert.deepEqual(facebookBusinessAuthorizeParams("1081657210879915"), {
    config_id: "1081657210879915",
    override_default_response_type: "true",
  });
});
