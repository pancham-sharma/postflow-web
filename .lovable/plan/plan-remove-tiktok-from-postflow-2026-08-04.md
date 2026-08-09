# Plan: Remove TikTok from PostFlow

## Goal
Completely remove TikTok as a supported platform from the PostFlow app, including code, UI references, demo data, database rows, and backend secrets.

## What I need from you
Nothing — no credentials or third-party setup are needed for removal. You have already confirmed the scope below, so I will proceed after approval.

## Decisions already confirmed
- **Integration scope**: fully remove TikTok (not just hide it)
- **Database data**: delete existing TikTok rows and tokens
- **Backend secrets**: delete `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`

## Code changes

### 1. Platform registry
- Remove `tiktok` from `SOCIAL_PLATFORMS` in `src/lib/social-platforms.ts`
- Remove the `tiktok` entry from the `platforms` array and `PlatformKey` type in `src/lib/postflow-data.ts`
- Remove the `Music2` icon import if it is no longer used

### 2. OAuth provider configuration
- Remove the `tiktok` block from `providers` in `src/lib/social-oauth.server.ts`
- Remove any TikTok-specific comments or aliases from `ENV_ALIASES` / placeholder lists if present

### 3. Publishing adapter
- Delete `src/lib/provider-adapters/tiktok.server.ts`
- Remove `import tiktok` and the `tiktok` key from `adapters` in `src/lib/provider-adapters/index.server.ts`

### 4. UI copy
- Remove TikTok from the accounts page description and meta tags in `src/routes/_authenticated/app.accounts.tsx`
- Remove TikTok from the create-post meta tags and any platform references in `src/routes/_authenticated/app.create.tsx`
- Remove TikTok from the landing page description in `src/routes/index.tsx`
- Remove TikTok from the privacy policy in `src/routes/privacy.tsx`
- Remove `tiktok` from `AUTHORIZE_HOSTS` in `src/routes/_authenticated/app.accounts.tsx`
- Remove TikTok from any demo/mock data in `src/lib/postflow-data.ts`

### 5. Documentation
- Remove TikTok from `README.md`, `SECURITY.md`, and `docs/backend-implementation-prompt.md` where mentioned

### 6. Database cleanup
- Delete all rows where `platform = 'tiktok'` from:
  - `social_connections`
  - `social_post_destinations`
  - `publish_jobs`
  - `publishing_job_destinations`
  - `publishing_jobs` (if any posts are tied only to TikTok, consider whether to delete the post itself)
  - `provider_rate_limits`
  - `platform_capabilities`
  - `platform_controls`
  - `platform_health`
  - `oauth_states` (any pending TikTok states)
  - `social_account_events`
- Data cleanup will be done via the data-management tool, not a migration.

### 7. Backend secrets
- Delete `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` from the backend secret store.

## Verification
- Build passes and route tree regenerates cleanly
- `rg -i tiktok` returns only this plan and unrelated lockfile entries
- No runtime errors on the accounts, create, or landing pages
- Existing posts with TikTok destinations are removed; other posts are preserved

## Notes
- This change is destructive for TikTok data and cannot be undone without re-adding the platform and reconnecting accounts.
- No schema changes are required because the platform column is plain text, not an enum.
