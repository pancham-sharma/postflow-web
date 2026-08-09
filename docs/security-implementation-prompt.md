# Full Website Security Implementation Prompt (source requirements)

This document stores the security baseline requested for PostFlow. The implemented
controls and their mapping onto the PostFlow stack live in `SECURITY.md`.

Scope: protect all API keys and secrets; backend-only OAuth with single-use state
and PKCE; AES-GCM encrypted provider tokens; short-lived access tokens with
rotating refresh tokens and revocation on logout/password change; Argon2-class
password hashing with 12+ character minimum and generic reset responses;
rate limiting and OTP hardening on all auth endpoints; account-enumeration
protection; verified email/phone change flows; server-side session management with
revocation; role-based access control with IDOR checks on every object ID;
serializer-level request validation; parameterized queries only; XSS protection
with a strict CSP; CSRF protection for cookie-authenticated endpoints; exact-origin
CORS allowlists; redirect allowlists; SSRF protection for user-supplied URLs;
magic-byte file upload validation with random storage names; publishing
idempotency; JSON-only background job payloads; server-verified payments and
signed webhooks; security headers and HTTPS-only cookies; production settings with
DEBUG disabled and strict hosts; sanitized centralized error handling; redacted
structured logging; immutable audit logs; hardened admin panel with 2FA;
dependency and secret scanning in CI; database least privilege; data-privacy and
account-deletion flows; safe account linking; automated security tests;
startup environment validation; response sanitization; and documented secret
rotation with encryption-key versioning.
