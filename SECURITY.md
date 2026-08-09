# PostFlow Security Policy & Implemented Controls

PostFlow runs on React 19 + TypeScript + Vite + Tailwind + shadcn/ui with a
TanStack Start server runtime (server functions + server routes) and a managed
Postgres backend. The controls below map the requested production security
baseline onto this stack. Where the baseline names Django/DRF specifics, the
equivalent control in this runtime is listed instead.

## 1. Secrets

- Every private credential lives in the encrypted backend secret store and is
  read only inside server function / server route handlers via `process.env`.
- No secret is ever exposed through `VITE_*`, bundles, HTML, localStorage,
  sessionStorage, JS-readable cookies, API responses or logs.
- Only publishable values (Supabase URL + publishable key) exist client-side.
- `.gitignore` blocks `.env`, `.env.*` (except `.env.example`), `*.pem`,
  `*.key`, `credentials.json`, `client_secret*.json`, `service-account*.json`,
  logs and caches.

Required server-side variables:

```
SOCIAL_TOKEN_ENCRYPTION_KEY
POSTFLOW_APP_URL
META_OAUTH_CLIENT_ID / META_OAUTH_CLIENT_SECRET
PINTEREST_OAUTH_CLIENT_ID / PINTEREST_OAUTH_CLIENT_SECRET
SNAPCHAT_OAUTH_CLIENT_ID / SNAPCHAT_OAUTH_CLIENT_SECRET
YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET
```

If a secret has ever been committed anywhere, rotate it at the provider
dashboard — deleting the file is not sufficient.

## 2. Backend-only OAuth

- Authorization URLs are built server-side (`src/lib/social-connections.functions.ts`).
- Token exchange happens only in `src/lib/social-oauth.server.ts`; the browser
  never sees a client secret, authorization code result or provider token.
- Callback route: `src/routes/api/public/oauth/callback.$platform.ts`.
- `state` is 32 random bytes, stored hashed (SHA-256) server-side, single-use,
  short-lived, platform-bound and user-bound. Missing, expired, reused or
  cross-platform states are rejected.
- PKCE (S256) is used for every provider that supports it.
- Redirect URIs are derived from `POSTFLOW_APP_URL` so they are byte-identical
  between the authorize request, the provider dashboard and the token exchange.
- Return paths are sanitized to a same-origin allowlisted path
  (`src/lib/oauth-return-path.ts`) — no open redirects.

## 3. Token storage

- Provider access/refresh tokens are encrypted with AES-256-GCM
  (`src/lib/token-crypto.server.ts`) before storage; the master key lives in
  backend secrets, never in the database.
- No endpoint returns a decrypted provider token. API responses expose only
  provider, display name, avatar, scopes, status and timestamps.
- Tokens, refresh tokens, codes, verifiers and secrets are never logged; logs
  carry a client-ID prefix and a stable error code only.
- Background refresh runs before expiry (`src/lib/token-refresh.server.ts`).

## 4. Authentication & authorization

- Sessions are managed by the platform auth provider with short-lived access
  tokens and rotating refresh tokens; tokens are never placed in URLs.
- Every server function that touches user data runs `requireSupabaseAuth`;
  route guards are UX only.
- Row Level Security plus explicit GRANTs enforce per-user and per-workspace
  isolation on every table, blocking cross-user object access (IDOR).
- Roles live in a dedicated `user_roles` table and are checked through the
  `has_role` security-definer function — never trusted from the client.
- Password minimum length is 12 with leaked-password checking enabled.

## 5. Input, upload and publishing safety

- Server functions validate every payload with `inputValidator` + zod schemas.
- Uploads are checked by real magic bytes, not extension or client MIME, with
  per-type size limits and randomly generated storage paths.
- Publishing verifies account ownership, token validity, required scopes, media
  ownership and quota, and uses per-destination job rows with capped retries and
  exponential backoff to prevent duplicate publishes.
- No raw HTML from users is rendered; `dangerouslySetInnerHTML`, `eval` and
  `new Function` are not used.

## 6. Transport & headers

HTTPS only, with `Strict-Transport-Security`, a strict `Content-Security-Policy`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`-equivalent framing controls and a restrictive
`Permissions-Policy` (camera, microphone, geolocation, payment, usb disabled).

## 7. Audit logging

Admin and security-sensitive actions are written to an append-only
`admin_audit_logs` table (actor, action, target, timestamp, IP, result, safe
metadata). Normal admins cannot modify or delete audit rows, and no secret is
stored in audit metadata.

## 8. Reporting a vulnerability

Report suspected vulnerabilities privately to the project owner. Please do not
open a public issue containing credentials, tokens or exploit payloads.
