# PostFlow Complete Backend Implementation and Frontend Integration Prompt

Study the existing PostFlow codebase and complete its real production backend while connecting every existing frontend page to real backend data.

Do not rebuild the project from scratch.

Do not replace the current technology stack.

Do not add Django, Flask, Express, Firebase, Celery, or a separate Python backend.

Do not remove any existing page, route, database table, server function, provider adapter, design token, security policy, admin feature, publishing job feature, or OAuth implementation.

Extend, repair, complete, and connect the existing application using the architecture already present in the repository.

---

# 1. Product overview

PostFlow is a multi-platform social publishing workspace that lets users upload media once and publish it across:

* Instagram
* Facebook
* Pinterest
* YouTube
* Snapchat

The product includes:

* Authentication
* Dashboard
* Social account connections
* Post composer
* Media library
* Scheduled publishing
* Content calendar
* Publishing history
* Per-platform publishing results
* Notifications
* Workspace settings
* Admin console
* API keys
* Audit logs
* Failed-job inspection
* Provider health monitoring
* Retry and backoff
* Realtime publishing updates

The main user flow is:

```text
Register or log in
→ enter workspace
→ connect social accounts
→ upload media
→ write main content
→ customize content per platform
→ select connected destinations
→ validate content
→ publish immediately or schedule
→ monitor destination-level results
→ inspect publishing history
```

---

# 2. Existing technology stack

Use the existing implementation:

## Frontend

* React 19
* TypeScript
* Vite 7
* TanStack Start
* TanStack Router
* File-based routing
* TanStack Query
* Tailwind CSS v4
* shadcn UI
* lucide-react icons

## Backend

* Lovable Cloud
* PostgreSQL
* Authentication
* Row-level security
* Server functions using `createServerFn`
* Server-only modules using `*.server.ts`
* Public server routes under `src/routes/api/public/*`
* Private storage buckets
* Signed URLs
* Database-backed publishing jobs
* PostgreSQL scheduling through `pg_cron`
* Supabase-compatible realtime database subscriptions where already implemented

## Package manager

Use:

```bash
bun install
bun run dev
bun run build
```

Do not convert the project to npm, pnpm, or yarn unless the existing repository already supports them.

---

# 3. Existing project structure

Preserve the current structure:

```text
src/
├─ routes/
│  ├─ index.tsx
│  ├─ login.tsx
│  ├─ register.tsx
│  ├─ __root.tsx
│  ├─ _authenticated/
│  │  ├─ app.tsx
│  │  ├─ app.index.tsx
│  │  ├─ app.create.tsx
│  │  ├─ app.media.tsx
│  │  ├─ app.calendar.tsx
│  │  ├─ app.posts.tsx
│  │  ├─ app.accounts.tsx
│  │  ├─ app.settings.tsx
│  │  └─ app.admin.*.tsx
│  └─ api/public/
│     ├─ oauth/
│     ├─ publishing/
│     ├─ webhooks/
│     └─ support/
├─ components/
├─ hooks/
├─ lib/
│  ├─ *.functions.ts
│  ├─ *.server.ts
│  ├─ admin-types.ts
│  ├─ admin-helpers.ts
│  ├─ social-platforms.ts
│  ├─ social-oauth.server.ts
│  ├─ publishing-validation.server.ts
│  ├─ postflow-data.ts
│  ├─ provider-adapters/
│  └─ mcp/
└─ styles.css
```

Never manually edit:

```text
src/routeTree.gen.ts
```

TanStack Router must regenerate it automatically.

---

# 4. Core implementation objective

Complete the backend and connect the frontend so that:

* No production page depends on demo data.
* No user-facing action is a visual-only mock.
* Every form submits to a real server function.
* Every list loads from PostgreSQL.
* Every mutation updates the correct TanStack Query cache.
* Every write is protected by authentication and workspace authorization.
* Every user-owned row is scoped by `workspace_id`.
* Every admin write verifies the user’s role server-side.
* OAuth tokens never reach the browser.
* Publishing jobs produce real destination-level states.
* Realtime updates replace unnecessary polling where available.
* Polling stops when realtime is connected.
* Scheduled posts are claimed safely by the backend runner.
* Multiple workers cannot publish the same destination twice.
* All critical operations create audit records.
* Existing frontend layouts and design rules remain unchanged.

---

# 5. Design system restrictions

Use only:

| Token     | Value     |
| --------- | --------- |
| White     | `#FFFFFF` |
| Moonstone | `#4C9DB0` |

Everything else must be:

* Opacity variations
* Gradient variations
* Hatching variations
* Dashed-border variations
* Solid versus outlined treatments

All colors must come from semantic tokens in:

```text
src/styles.css
```

Components must not hardcode:

* Hex colors
* RGB colors
* HSL colors
* Tailwind blue, grey, red, green, yellow, orange, black, or cream classes

Do not use:

```tsx
bg-blue-500
bg-gray-100
text-black
text-white
border-red-500
```

Use semantic classes such as:

```tsx
bg-background
text-foreground
bg-primary
text-primary-foreground
border-border
bg-sidebar
text-sidebar-foreground
surface-strong
surface-light
hatch
grid-lines
```

Keep:

* DM Sans
* `shadow-soft`
* `shadow-lift`
* Radii of 10, 14, 16, 24, 28, 32 and 40px

Status must never rely only on color.

Use:

* Icons
* Text labels
* Hatching
* Dashed borders
* Solid fills
* Outlined fills
* Warning symbols

---

# 6. Backend architecture rules

All client-callable backend operations must use:

```ts
createServerFn()
```

Each server function must include:

```ts
.inputValidator(zodSchema)
.middleware([requireSupabaseAuth])
```

or the project’s equivalent authenticated middleware.

Every server function must:

1. Validate input with Zod.
2. Resolve the authenticated user server-side.
3. Resolve the active workspace server-side.
4. Confirm workspace membership.
5. Confirm object ownership.
6. Confirm role when needed.
7. Select only required columns.
8. Perform the database operation.
9. Add audit logging for sensitive actions.
10. Return a typed, user-safe response.
11. Never return secrets or encrypted token columns.

Keep provider credentials, token operations, encryption, API calls, webhook verification and publishing logic inside:

```text
*.server.ts
```

These files must never be imported into client bundles.

---

# 7. Required backend module structure

Create or complete these modules where appropriate:

```text
src/lib/
├─ auth.functions.ts
├─ auth.server.ts
├─ workspace.functions.ts
├─ workspace.server.ts
├─ dashboard.functions.ts
├─ accounts.functions.ts
├─ social-accounts.functions.ts
├─ social-accounts.server.ts
├─ social-oauth.server.ts
├─ oauth.functions.ts
├─ media.functions.ts
├─ media.server.ts
├─ composer.functions.ts
├─ publishing.functions.ts
├─ publishing.server.ts
├─ publishing-validation.server.ts
├─ publishing-runner.server.ts
├─ publishing-status.server.ts
├─ scheduling.server.ts
├─ token-refresh.server.ts
├─ rate-limit.server.ts
├─ notifications.functions.ts
├─ notifications.server.ts
├─ calendar.functions.ts
├─ post-history.functions.ts
├─ settings.functions.ts
├─ admin.functions.ts
├─ admin.server.ts
├─ api-keys.functions.ts
├─ api-keys.server.ts
├─ audit.server.ts
├─ realtime.ts
├─ social-platforms.ts
└─ provider-adapters/
   ├─ types.ts
   ├─ index.server.ts
   ├─ facebook.server.ts
   ├─ instagram.server.ts
   ├─ pinterest.server.ts
   ├─ youtube.server.ts
   └─ snapchat.server.ts
```

Reuse existing files instead of duplicating them.

---

# 8. Database migration requirements

Inspect all existing migrations before adding new ones.

Do not recreate tables that already exist.

Create additive migrations for missing fields, constraints, policies, indexes, functions and triggers.

Every new public table must follow this order:

1. Create or alter the table.
2. Add constraints.
3. Add indexes.
4. Grant required permissions.
5. Enable row-level security.
6. Add RLS policies.
7. Add triggers where required.
8. Add comments or documentation where useful.

All workspace-owned rows must include:

```text
workspace_id
```

---

# 9. Core database tables

Create or complete the following data model.

## 9.1 Profiles

```text
profiles
- id
- full_name
- display_name
- avatar_url
- timezone
- created_at
- updated_at
```

The `id` must match the authenticated user ID.

Users may:

* Read their profile
* Update their profile

Admins may inspect safe profile fields.

---

## 9.2 Workspaces

```text
workspaces
- id
- name
- slug
- owner_user_id
- default_timezone
- status
- created_at
- updated_at
```

Workspace statuses:

* active
* suspended
* archived

---

## 9.3 Workspace members

```text
workspace_members
- id
- workspace_id
- user_id
- membership_status
- joined_at
- created_at
- updated_at
```

Use active membership as the base condition for workspace data access.

---

## 9.4 User roles

Keep roles in a separate table:

```text
user_roles
- id
- user_id
- role
- assigned_by
- created_at
```

Supported roles:

* admin
* support
* member

Never read role authority from:

* Local storage
* Session storage
* Browser state
* URL parameters
* User-editable profile metadata

Use the existing security-definer helper:

```text
has_role
```

Complete it if necessary.

---

## 9.5 Social connections

```text
social_connections
- id
- workspace_id
- connected_by
- platform
- provider_user_id
- encrypted_access_token
- encrypted_refresh_token
- token_expires_at
- granted_scopes
- missing_scopes
- connection_status
- connected_at
- disconnected_at
- last_refresh_at
- last_refresh_error
- created_at
- updated_at
```

Statuses:

* connected
* disconnected
* expired
* refresh_failed
* permission_required
* revoked
* disabled

Tokens must remain encrypted using AES-256-GCM.

---

## 9.6 Social accounts

```text
social_accounts
- id
- workspace_id
- connection_id
- platform
- provider_account_id
- account_name
- username
- profile_image_url
- account_type
- provider_parent_id
- is_default
- publishing_enabled
- publishing_eligible
- connection_status
- last_synced_at
- token_expires_at
- last_successful_publish_at
- metadata
- created_at
- updated_at
```

Add uniqueness:

```text
unique(workspace_id, platform, provider_account_id)
```

Do not create duplicate social-account records during reconnection.

---

## 9.7 OAuth state

```text
oauth_states
- id
- user_id
- workspace_id
- platform
- state_hash
- encrypted_pkce_verifier
- return_path
- existing_account_id
- expires_at
- consumed_at
- created_at
```

Never store raw OAuth state when a secure hash is sufficient.

OAuth states must:

* Expire
* Be single-use
* Be tied to user
* Be tied to workspace
* Be tied to platform

---

## 9.8 Media assets

```text
media_assets
- id
- workspace_id
- uploaded_by
- storage_bucket
- storage_path
- thumbnail_path
- original_filename
- mime_type
- media_type
- file_size
- width
- height
- duration_seconds
- aspect_ratio
- checksum
- processing_status
- created_at
- updated_at
```

Processing statuses:

* uploading
* processing
* ready
* failed
* deleted

---

## 9.9 Social posts

```text
social_posts
- id
- workspace_id
- created_by
- base_caption
- post_type
- status
- scheduled_at_utc
- timezone
- idempotency_key
- published_at
- created_at
- updated_at
```

Statuses:

* draft
* validating
* queued
* scheduled
* publishing
* published
* partially_published
* failed
* cancelled
* requires_attention

---

## 9.10 Social post media

```text
social_post_media
- id
- workspace_id
- post_id
- media_asset_id
- sort_order
- created_at
```

---

## 9.11 Social post destinations

```text
social_post_destinations
- id
- workspace_id
- post_id
- social_account_id
- platform
- platform_caption
- platform_title
- platform_description
- platform_settings
- validation_status
- publish_status
- provider_post_id
- provider_post_url
- provider_job_id
- error_code
- error_message
- published_at
- created_at
- updated_at
```

Destination statuses:

* pending
* validating
* blocked
* queued
* uploading
* processing
* published
* failed
* retry_scheduled
* cancelled
* reconnect_required
* platform_paused

---

## 9.12 Publishing jobs

Use existing job tables where already present.

Complete them to support:

```text
publish_jobs
- id
- workspace_id
- post_id
- job_type
- status
- scheduled_for
- started_at
- completed_at
- idempotency_key
- created_at
- updated_at
```

Job types:

* publish_now
* scheduled_publish
* retry
* validation
* token_refresh

---

## 9.13 Publishing job destinations

```text
publish_job_destinations
- id
- workspace_id
- publish_job_id
- destination_id
- social_account_id
- platform
- status
- attempt_count
- next_retry_at
- locked_at
- locked_by
- last_error_code
- last_error_message
- created_at
- updated_at
```

---

## 9.14 Publishing attempts

```text
publish_attempts
- id
- workspace_id
- job_destination_id
- attempt_number
- status
- safe_request_payload
- safe_provider_response
- error_code
- error_message
- retryable
- started_at
- completed_at
- next_retry_at
- created_at
```

Never save:

* Access tokens
* Refresh tokens
* Authorization codes
* Provider secrets
* Private request headers

---

## 9.15 Publishing job events

```text
publish_job_events
- id
- workspace_id
- publish_job_id
- destination_id
- event_type
- message
- safe_metadata
- created_at
```

Use this table for realtime UI updates.

---

## 9.16 Platform integrations

```text
platform_integrations
- id
- platform
- oauth_enabled
- publishing_enabled
- maintenance_mode
- rate_limit_config
- maximum_retries
- token_refresh_threshold_minutes
- failure_alert_threshold
- public_notice
- internal_notice
- updated_by
- updated_at
```

---

## 9.17 Platform health

```text
platform_health
- id
- platform
- last_oauth_success_at
- last_publish_success_at
- last_publish_failure_at
- last_webhook_at
- last_poll_at
- last_runner_at
- last_token_refresh_at
- consecutive_failures
- average_latency_ms
- expiring_permission_count
- expired_permission_count
- waiting_rate_limited_jobs
- updated_at
```

---

## 9.18 Rate-limit buckets

```text
provider_rate_limit_buckets
- id
- platform
- workspace_id
- social_account_id
- window_started_at
- request_count
- request_limit
- reset_at
- updated_at
```

---

## 9.19 Notifications

```text
notifications
- id
- workspace_id
- user_id
- notification_type
- title
- message
- related_account_id
- related_post_id
- related_job_id
- is_read
- created_at
```

---

## 9.20 API keys

Use the existing scoped API-key model.

Required fields:

```text
api_keys
- id
- workspace_id
- created_by
- name
- prefix
- secret_hash
- scopes
- status
- last_used_at
- last_used_ip
- request_count
- expires_at
- revoked_at
- created_at
```

API-key secrets must:

* Start with `pfsk_`
* Be shown only once
* Be hashed at rest
* Never be recoverable after creation

---

## 9.21 Audit logs

```text
admin_audit_logs
- id
- actor_user_id
- workspace_id
- action
- target_type
- target_id
- platform
- ip_address
- user_agent
- safe_metadata
- created_at
```

Use the existing table name if different.

---

# 10. Required indexes

Review query plans and add indexes for every real filter and sort path.

At minimum, evaluate:

```text
profiles(id)

workspace_members(user_id, membership_status)
workspace_members(workspace_id, membership_status)
workspace_members(workspace_id, user_id)

user_roles(user_id, role)

social_connections(workspace_id, platform, connection_status)
social_connections(token_expires_at, connection_status)

social_accounts(workspace_id, connection_status)
social_accounts(workspace_id, platform)
social_accounts(workspace_id, platform, provider_account_id)
social_accounts(connection_id)
social_accounts(token_expires_at)

media_assets(workspace_id, created_at desc)
media_assets(workspace_id, media_type, created_at desc)
media_assets(workspace_id, processing_status)

social_posts(workspace_id, created_at desc)
social_posts(workspace_id, status, scheduled_at_utc)
social_posts(workspace_id, scheduled_at_utc)

social_post_destinations(post_id, publish_status)
social_post_destinations(workspace_id, social_account_id)
social_post_destinations(workspace_id, platform, publish_status)

publish_jobs(workspace_id, created_at desc)
publish_jobs(status, scheduled_for)
publish_jobs(idempotency_key)

publish_job_destinations(publish_job_id)
publish_job_destinations(status, next_retry_at)
publish_job_destinations(platform, status, next_retry_at)

publish_attempts(job_destination_id, attempt_number)

publish_job_events(publish_job_id, created_at)

notifications(user_id, is_read, created_at desc)

admin_audit_logs(created_at desc)
admin_audit_logs(actor_user_id, created_at desc)
```

Do not add redundant indexes.

Do not use `select("*")` in list queries containing large JSON fields.

---

# 11. Row-level security

Enable RLS on every user-owned and workspace-owned table.

Create reusable security functions where useful:

```sql
is_workspace_member(workspace_uuid uuid)
is_workspace_owner(workspace_uuid uuid)
has_role(required_role text)
can_manage_workspace(workspace_uuid uuid)
```

## Member access

Members may:

* Read workspace dashboard data
* Read connected accounts in their workspace
* Connect or disconnect accounts when workspace rules allow
* Upload and manage media
* Create and update posts
* Schedule posts
* View publishing history
* View safe destination errors
* Read their notifications
* Update their own profile

Members may not:

* Read encrypted token fields
* Read API-key hashes
* Read another workspace
* Change roles
* Access admin-only operations
* Read private provider payloads

## Support access

Support users may:

* Inspect safe job metadata
* Inspect sanitized provider responses
* Help retry failed jobs
* View platform health
* View safe user and workspace details

Support users may not:

* Decrypt OAuth tokens
* Read API-key secrets
* Assign admin roles unless explicitly allowed
* Bypass workspace policy without an audited server operation

## Admin access

Admins may:

* Manage users and roles
* Suspend users
* Manage platform integrations
* Pause publishing
* Edit health thresholds
* Requeue or cancel jobs
* Manage API keys
* Read audit logs
* Inspect sanitized provider responses

Admin server functions must call the role assertion helper before every write.

---

# 12. Authentication backend

Connect:

```text
/login
/register
```

to real authentication.

Implement:

* Email and password registration
* Email and password login
* Google sign-in
* Session restoration
* Logout
* Authenticated route protection
* Safe redirect after login
* Profile initialization
* Default workspace initialization
* Default membership initialization
* Default `member` role initialization

On first successful registration:

1. Create profile.
2. Create default workspace.
3. Set the user as workspace owner.
4. Create active workspace membership.
5. Assign `member` role.
6. Redirect to `/app`.

Do not assign admin from client input.

Never allow a registration form to submit a role.

---

# 13. Authenticated route guard

Protect everything under:

```text
/app
```

The route guard must:

* Resolve session server-side where possible.
* Redirect unauthenticated users to `/login`.
* Preserve a safe return URL.
* Reject unsafe external redirects.
* Load the user’s active workspace.
* Load safe role information.
* Avoid duplicate auth requests on every child route.

Do not rely only on client-side hiding.

---

# 14. Dashboard backend and frontend connection

Connect the existing Dashboard to real data.

Create a server function such as:

```ts
getDashboardSummary()
```

Return only:

```ts
{
  connectedAccountCount,
  platformsNeedingAttention,
  upcomingPosts,
  publishingSummary,
  recentActivity,
  mediaCount
}
```

Dashboard widgets:

* Connected accounts
* Upcoming scheduled posts
* Recent posts
* Draft count
* Failed destinations
* Quick actions
* Platform health notices

Load independent sections in parallel.

Do not block the full page because one widget fails.

Use section-level error states and skeletons.

Invalidate dashboard summary after:

* Connecting an account
* Disconnecting an account
* Publishing
* Scheduling
* Cancelling a post
* Uploading media

---

# 15. OAuth backend

Use real OAuth authorization-code flows.

Supported providers:

* Meta for Facebook and Instagram
* Pinterest
* Google for YouTube
* Snapchat

## OAuth start flow

Create:

```ts
startOAuthConnection()
```

Input:

```ts
{
  platform,
  workspaceId,
  existingAccountId?,
  returnPath?
}
```

Server-side steps:

1. Authenticate user.
2. Validate workspace membership.
3. Confirm platform OAuth is enabled.
4. Generate secure random state.
5. Store only a secure state hash.
6. Generate PKCE verifier and challenge when supported.
7. Encrypt the verifier.
8. Store state metadata with expiry.
9. Build callback URL from trusted server configuration.
10. Build provider authorization URL.
11. Return only the authorization URL.

Never return:

* Client secret
* PKCE verifier
* Access token
* Refresh token
* Encryption key

---

# 16. OAuth callback routes

Implement:

```text
/api/public/oauth/callback/facebook
/api/public/oauth/callback/instagram
/api/public/oauth/callback/pinterest
/api/public/oauth/callback/youtube
/api/public/oauth/callback/snapchat
```

Each callback must:

1. Read provider response.
2. Reject unknown providers.
3. Require state.
4. Hash and find the state record.
5. Reject expired state.
6. Reject consumed state.
7. Confirm user and workspace association.
8. Handle provider cancellation.
9. Require authorization code.
10. Decrypt PKCE verifier when needed.
11. Exchange code server-side.
12. Encrypt returned tokens using AES-256-GCM.
13. Fetch provider identity.
14. Fetch available social accounts.
15. Save temporary discovery data or create a safe selection session.
16. Mark OAuth state as consumed.
17. Create audit record.
18. Redirect to a trusted PostFlow route.

Use a safe return URL such as:

```text
/app/accounts?oauth=success&platform=facebook
```

For failure:

```text
/app/accounts?oauth=failed&reason=permission_denied
```

Never render raw provider errors or tokens.

---

# 17. Account discovery

After OAuth, fetch all provider identities the user can manage.

## Facebook

Fetch eligible Facebook Pages.

Store safe information:

* Page ID
* Name
* Category
* Profile image
* Task or role eligibility
* Publishing eligibility

Encrypt page access tokens separately where required.

## Instagram

Fetch eligible professional Instagram accounts linked to authorized Meta assets.

Store:

* Instagram account ID
* Username
* Profile image
* Account type
* Linked Facebook Page ID
* Publishing eligibility
* Granted scopes

Do not treat personal accounts as direct-publishing accounts unless the official API supports them.

## Pinterest

Fetch:

* Authorized account
* Available boards
* Board IDs
* Board names
* Publishing permission

## YouTube

Fetch accessible channels:

* Channel ID
* Channel title
* Channel thumbnail
* Upload eligibility
* Available playlists where permitted

## Snapchat

Fetch only identities supported by the approved Snapchat API integration.

If direct publishing is unavailable, expose the account as connected but mark:

```text
publishing_eligible = false
```

Never simulate unsupported publishing.

---

# 18. Connected Accounts frontend integration

Connect:

```text
/app/accounts
```

to real backend functions.

Required queries:

```ts
listPlatformConnections()
listConnectedAccounts()
getAccountsNeedingAttention()
getOAuthResult()
```

Required mutations:

```ts
startOAuthConnection()
connectSelectedProviderAccounts()
disconnectSocialAccount()
reconnectSocialAccount()
refreshSocialAccount()
syncSocialAccount()
setDefaultSocialAccount()
```

## Account-selection dialog

After successful OAuth:

* Fetch discovered provider accounts.
* Show profile image.
* Show account name.
* Show handle.
* Show account type.
* Show eligibility.
* Show permissions.
* Show whether already connected.
* Allow selecting multiple accounts.
* Prevent duplicates.
* Reuse disconnected records when reconnecting.

After connecting selected accounts:

* Invalidate account queries.
* Invalidate dashboard summary.
* Close dialog.
* Show success toast.
* Clear temporary OAuth query parameters safely.

---

# 19. Disconnect account backend

Implement:

```ts
disconnectSocialAccount()
```

Steps:

1. Authenticate.
2. Verify workspace membership.
3. Verify account ownership.
4. Load scheduled destinations using the account.
5. Attempt provider token revocation where supported.
6. Clear or invalidate encrypted tokens.
7. Mark account disconnected.
8. Disable publishing.
9. Cancel queued destination jobs for this account.
10. Mark future scheduled destinations as requiring attention.
11. Keep published history.
12. Create notification.
13. Create audit log.
14. Return affected scheduled-post count.

Disconnecting one account must not disconnect every account under the same connection unless the provider token model requires it.

When a shared provider connection must be revoked, update all affected accounts clearly and atomically.

---

# 20. Reconnect account backend

Implement:

```ts
reconnectSocialAccount()
```

Use OAuth with:

```text
existing_account_id
```

stored securely in OAuth state.

After callback:

* Match provider account ID.
* Update the existing record.
* Update encrypted tokens.
* Update scopes.
* Update expiry.
* Restore publishing eligibility.
* Preserve history.
* Preserve default status.
* Preserve scheduled-post relationships.
* Revalidate future posts.
* Create notification.
* Create audit record.

Do not insert a duplicate social account.

---

# 21. Media storage backend

Use a private storage bucket:

```text
post-media
```

Implement:

```ts
createMediaUpload()
completeMediaUpload()
listMediaAssets()
getMediaAsset()
deleteMediaAsset()
```

Upload flow:

1. Authenticate.
2. Verify workspace.
3. Validate requested MIME type.
4. Validate requested file size.
5. Generate safe storage path.
6. Return signed upload URL.
7. Browser uploads directly to storage.
8. Browser calls completion function.
9. Server validates stored object metadata.
10. Create media record.
11. Trigger metadata or thumbnail processing.
12. Return media asset.

Storage path format:

```text
<workspace-id>/<user-id>/<year>/<month>/<uuid>.<extension>
```

Never trust the original filename as the storage path.

Validate:

* File signature
* MIME type
* Extension
* Size
* Media type
* Workspace ownership

Block:

* Executables
* HTML files
* SVG with active scripting unless sanitized
* Path traversal
* MIME spoofing
* Oversized files
* Unsupported media

---

# 22. Media Library frontend integration

Connect:

```text
/app/media
```

to real data.

Use:

* Cursor pagination
* Server-side media-type filters
* Server-side search
* Explicit selected columns
* Thumbnail URLs
* Signed view URLs
* Lazy loading
* Debounced search

Required UI actions:

* Upload
* Preview
* Search
* Filter
* Select for composer
* Delete
* Copy asset reference
* View metadata

Do not load original video files for every card.

Use poster thumbnails and:

```html
preload="none"
```

or:

```html
preload="metadata"
```

only when appropriate.

---

# 23. Composer backend

Connect:

```text
/app/create
```

to real backend functions.

Required server functions:

```ts
createDraftPost()
updateDraftPost()
attachPostMedia()
removePostMedia()
setPostDestinations()
savePlatformOverrides()
validatePost()
publishPostNow()
schedulePost()
```

## Draft save

Drafts must save:

* Base caption
* Media
* Selected social accounts
* Platform-specific overrides
* Hashtags
* Titles
* Descriptions
* Board selection
* Playlist selection
* Privacy settings
* Timezone
* Last edited time

Support autosave with debouncing.

Do not send a mutation on every keypress.

Use a reasonable autosave delay such as 800–1500ms after editing stops.

Show:

* Saving
* Saved
* Save failed

---

# 24. Composer frontend state

Keep composer state isolated.

Split into:

* Main caption editor
* Media selector
* Destination selector
* Platform override tabs
* Validation summary
* Schedule controls
* Preview
* Publish actions

Do not re-render the entire composer on every caption keypress.

Do not duplicate query data into state unless creating an editable draft.

Use stable destination IDs.

Use field-level state updates.

Run lightweight local validation while typing.

Run backend validation:

* After media changes
* After destinations change
* On platform-tab blur
* Before publishing
* Before scheduling

---

# 25. Platform validation engine

Complete:

```text
src/lib/publishing-validation.server.ts
```

Validation must run per destination.

Check:

* Account connection status
* Token validity
* Required scopes
* Provider account eligibility
* Admin platform status
* Maintenance mode
* Supported post type
* File MIME type
* File size
* Dimensions
* Aspect ratio
* Video duration
* Caption limit
* Title requirement
* Description requirement
* Hashtag limit
* Carousel count
* Board requirement
* Playlist requirement
* Privacy requirement
* Link requirement
* Thumbnail requirement

Normalized output:

```ts
type ValidationResult = {
  destinationId: string
  socialAccountId: string
  platform: SocialPlatform
  status: 'ready' | 'warning' | 'blocked'
  issues: Array<{
    code: string
    field?: string
    message: string
    canAutoFix: boolean
  }>
}
```

Do not hardcode evolving platform rules throughout components.

Keep provider capabilities in a central server-side configuration.

The frontend may receive only safe capability information.

---

# 26. Provider adapter contract

Use or complete:

```text
src/lib/provider-adapters/types.ts
```

Interface:

```ts
export interface PublishingProviderAdapter {
  validate(
    input: ProviderValidationInput
  ): Promise<ProviderValidationResult>

  refreshToken(
    account: SocialAccountRecord
  ): Promise<TokenRefreshResult>

  publish(
    input: ProviderPublishInput
  ): Promise<ProviderPublishResult>

  getStatus?(
    providerJobId: string,
    account: SocialAccountRecord
  ): Promise<ProviderPublishStatus>

  revoke?(
    account: SocialAccountRecord
  ): Promise<void>

  processWebhook?(
    input: ProviderWebhookInput
  ): Promise<ProviderWebhookResult>
}
```

Normalized result:

```ts
export type ProviderPublishResult = {
  status: 'published' | 'processing' | 'failed'
  providerPostId?: string
  providerPostUrl?: string
  providerJobId?: string
  safeResponse?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  retryable: boolean
}
```

Register adapters in:

```text
provider-adapters/index.server.ts
```

Never dynamically import provider adapters from client code.

---

# 27. Real provider publishing

Implement real provider API calls only when:

* OAuth is configured
* Required scopes are granted
* Provider application is approved where required
* Account is eligible
* Platform publishing is enabled
* Media is valid

When provider credentials are missing, return:

```text
OAuth is not configured for this platform.
```

When publishing access is unavailable, return:

```text
Direct publishing is not available for this account.
```

Never generate fake post IDs.

Never mark a post published without provider confirmation.

Never simulate a provider success response.

---

# 28. Publish Now backend flow

Implement:

```ts
publishPostNow()
```

Steps:

1. Authenticate user.
2. Validate workspace membership.
3. Validate post ownership.
4. Verify post has destinations.
5. Require or generate idempotency key.
6. Reject duplicate active submission.
7. Run server validation for every destination.
8. Mark blocked destinations appropriately.
9. Create parent publish job.
10. Create one job destination per valid destination.
11. Write initial job events.
12. Commit transaction.
13. Trigger secure runner.
14. Return parent job ID.

Do not execute every provider API call inside the browser-facing request if it risks timeout.

The frontend must receive quickly:

```ts
{
  jobId,
  status: 'queued'
}
```

---

# 29. Publishing runner

Implement a secure internal route:

```text
/api/public/publishing/run
```

Despite being under a public route directory, it must not be openly callable.

Require:

* Internal runner secret
* Signed request
* Or trusted scheduled invocation mechanism

Runner flow:

1. Authenticate internal invocation.
2. Select due job destinations.
3. Use `FOR UPDATE SKIP LOCKED`.
4. Claim a limited batch.
5. Set `locked_at`.
6. Set `locked_by`.
7. Commit claim.
8. Process each destination.
9. Revalidate account.
10. Refresh token when needed.
11. Check rate-limit bucket.
12. Call provider adapter.
13. Save sanitized attempt.
14. Save job event.
15. Update destination.
16. Update parent job status.
17. Update post status.
18. Create notifications.
19. Release lock.

The runner must be safe with multiple concurrent workers.

---

# 30. Scheduled publishing

Use `pg_cron` or the existing supported scheduler to call the secure runner.

Scheduled flow:

```text
pg_cron
→ internal publishing runner
→ claim due destinations
→ validate
→ refresh token
→ apply rate limits
→ publish
→ update realtime events
```

Store schedule in UTC.

Preserve the user-selected IANA timezone.

Before publishing, recheck:

* Social account connection
* Permissions
* Token expiry
* Media existence
* Validation rules
* Admin platform state
* Rate limits

If one account fails, other destinations must continue.

---

# 31. Job idempotency

Use unique idempotency keys for:

* Post publish submission
* Scheduled job creation
* Destination publishing
* Manual retry
* API-key requests where appropriate

Recommended destination key:

```text
post_id + destination_id + publish_revision
```

Do not create duplicate provider posts when:

* User double-clicks Publish
* Browser retries
* Network request times out
* Runner executes twice
* Admin requeues an active destination

Disable frontend buttons while mutations are pending, but do not rely only on frontend disabling.

---

# 32. Retry and exponential backoff

Use the existing retry schedule:

```text
Attempt 1: 1 minute
Attempt 2: 5 minutes
Attempt 3: 15 minutes
Attempt 4: 60 minutes
Attempt 5: 360 minutes
```

Automatically retry only:

* Timeouts
* Temporary network failures
* Provider 429
* Provider 500–599
* Temporary processing states
* Temporary provider outages

Do not automatically retry:

* Missing permissions
* Invalid media
* Invalid caption
* Unsupported account
* Disconnected account
* Revoked token requiring user action
* Invalid destination
* Platform disabled by admin

Every retry must create a separate `publish_attempts` row.

---

# 33. Rate-limit backend

Implement provider rate-limit buckets.

Before provider calls:

1. Find or create bucket.
2. Lock bucket row.
3. Check reset time.
4. Reset count when window expires.
5. Compare request count with limit.
6. Increment atomically.
7. Release lock.

When blocked:

* Do not permanently fail the destination.
* Mark it `retry_scheduled`.
* Set `next_retry_at` to reset time.
* Create a job event.
* Show a user-safe delayed message.

---

# 34. Automatic token refresh

Implement token refresh:

* Before publishing when near expiry
* During scheduled health checks
* After provider token-expired responses
* After a user presses Refresh

Use configurable admin thresholds.

On success:

* Encrypt new access token.
* Encrypt new refresh token if rotated.
* Update expiry.
* Reset failure count.
* Update account status.
* Create safe audit record.

On permanent failure:

* Mark `reconnect_required`.
* Disable publishing.
* Stop future attempts for that account.
* Create user notification.
* Preserve history.
* Never expose provider token response.

---

# 35. Realtime publishing status

Use realtime subscriptions for:

```text
publish_jobs
publish_job_events
```

Frontend behavior:

1. Load initial job status with TanStack Query.
2. Subscribe to permitted workspace rows.
3. Update query cache from realtime events.
4. Stop polling while realtime connection is healthy.
5. Fall back to polling if realtime disconnects.
6. Stop polling after terminal state.
7. Unsubscribe when dialog closes or route changes.

Terminal states:

* published
* partially_published
* failed
* cancelled
* requires_attention

Do not refetch complete post history for every event.

Update only:

* Current job
* Current post
* Destination results
* Dashboard summary when final

---

# 36. Publishing progress frontend

Connect the Composer publish action to a real progress interface.

Show:

* Parent job status
* Completed destination count
* Failed destination count
* Processing destination count
* Selected platform
* Selected account
* Current stage
* Latest safe event
* Retry time
* Reconnect action
* View-on-platform action

Destination states:

* Waiting
* Validating
* Uploading
* Processing
* Published
* Retry Scheduled
* Failed
* Reconnect Required
* Platform Paused

Use accessible live-region updates.

Do not show raw provider responses to members.

---

# 37. Calendar backend and frontend

Connect:

```text
/app/calendar
```

Create:

```ts
getCalendarPosts()
```

Input:

```ts
{
  workspaceId,
  startDate,
  endDate,
  platforms?,
  statuses?
}
```

Return only visible-range data.

Do not load all historical posts.

Calendar must show:

* Drafts where relevant
* Scheduled posts
* Publishing posts
* Published posts
* Failed posts
* Partially published posts

Clicking an event should open post details.

When rescheduling is implemented:

* Validate destination state
* Update UTC time
* Preserve timezone
* Update pending jobs transactionally
* Reject edits after publishing starts

---

# 38. Post History backend and frontend

Connect:

```text
/app/posts
```

Use cursor pagination.

Create:

```ts
listPostHistory()
getPostHistoryDetail()
duplicatePost()
retryPostDestination()
cancelPostJob()
```

List response should contain only:

* Post ID
* Thumbnail
* Caption preview
* Created time
* Scheduled time
* Overall status
* Platform summary
* Destination counts
* Created-by display name

Load detailed destinations only when the row opens.

Detail view must show:

* Platform
* Account
* Status
* Attempts
* Published time
* Provider post ID
* Provider post URL
* User-safe error
* Retry action
* Reconnect action
* Duplicate action

Show:

```text
Removing this record from PostFlow does not delete the post from the social platform.
```

Never claim local deletion removes the provider post.

---

# 39. Settings backend and frontend

Connect:

```text
/app/settings
```

Support:

## Profile

* Full name
* Display name
* Avatar
* Timezone

## Workspace

* Workspace name
* Default timezone
* Publishing defaults
* Notification preferences

## Security

* Session information where supported
* Logout
* Connected account summary

Use real mutations.

Validate:

* Name lengths
* Valid IANA timezone
* Avatar ownership
* Workspace authorization

Invalidate profile and workspace queries after updates.

---

# 40. Notifications backend and frontend

Create server functions:

```ts
listNotifications()
markNotificationRead()
markAllNotificationsRead()
getUnreadNotificationCount()
```

Create notifications for:

* Social account connected
* Social account disconnected
* Social account reconnected
* Token expiring
* Token expired
* Permission revoked
* Sync failed
* Post scheduled
* Publishing started
* Post published
* Partial success
* Publishing failed
* Retry scheduled
* Platform paused
* Platform resumed

Do not create duplicate notifications for the same event.

Use a deduplication key where useful.

---

# 41. Admin Overview backend

Connect:

```text
/app/admin
```

Create a compact server query returning:

* Total users
* Active users
* Active workspaces
* Connected accounts
* Jobs in last 24 hours
* 24-hour success rate
* Failed destinations
* Rate-limited destinations
* Paused platforms
* Recent admin activity

Do not run full-table counts on every request without suitable indexes or cached aggregates.

---

# 42. Admin Users backend

Connect the Users page to:

```ts
listAdminUsers()
updateUserRole()
suspendUser()
restoreUser()
```

Requirements:

* Server-side search
* Pagination
* Explicit columns
* Role assertion before writes
* Prevent user from removing the final required admin
* Prevent unsafe self-demotion where applicable
* Audit every role and suspension change

Never trust role names supplied by client without strict enum validation.

---

# 43. Failed Jobs backend

Connect the existing Failed Jobs interface.

Required functions:

```ts
listFailedJobs()
getJobInspector()
getJobAttempts()
getAttemptSafePayload()
compareAttemptPayloads()
requeueJobDestination()
cancelJobDestination()
```

Optimize:

* List returns summaries only.
* Attempts load only after opening a job.
* Provider payload loads only after expanding an attempt.
* Diff computation runs only when requested.
* Large payloads are truncated safely.
* Secrets are recursively redacted.

Redact keys containing patterns such as:

```text
token
secret
authorization
cookie
key
credential
password
code_verifier
client_secret
```

---

# 44. Admin Integrations backend

Connect integration controls to:

```ts
listPlatformIntegrations()
updatePlatformIntegration()
pausePlatform()
resumePlatform()
```

Admins can edit:

* OAuth enabled
* Publishing enabled
* Maintenance mode
* Rate limits
* Maximum retries
* Token refresh threshold
* Failure threshold
* Public notice
* Internal notice

When paused:

* New publishing is blocked.
* Existing history remains.
* Scheduled jobs move to paused or waiting.
* User sees the public notice.
* Admin action creates audit log.

---

# 45. Admin Health backend

Connect the Health page to:

```ts
getPlatformHealth()
getAccountHealthSummary()
updateHealthThresholds()
runHealthCheck()
```

Track:

* Last OAuth success
* Last publish success
* Last publish failure
* Last webhook event
* Last polling run
* Last scheduler run
* Last token refresh
* Consecutive failures
* Expiring permissions
* Expired permissions
* Waiting rate-limited jobs
* Average latency

Do not run expensive provider checks on every page load.

Show stored health data and provide a controlled manual refresh.

---

# 46. API-key backend

Create or complete:

```ts
createApiKey()
listApiKeys()
rotateApiKey()
revokeApiKey()
```

Create flow:

1. Generate secure random secret.
2. Prefix with `pfsk_`.
3. Hash full secret.
4. Store only hash and visible prefix.
5. Return full secret exactly once.
6. Require user acknowledgment before closing.
7. Never return it again.

Validate scopes with a strict enum.

Record:

* Last used time
* Last used IP
* Request count

Audit:

* Creation
* Rotation
* Revocation

---

# 47. Public API authentication

For API endpoints accepting `pfsk_` keys:

1. Read Authorization header.
2. Require Bearer scheme.
3. Parse key prefix.
4. Load active candidate.
5. Hash supplied key.
6. Compare securely.
7. Confirm expiry.
8. Confirm scope.
9. Apply rate limit.
10. Update usage metadata asynchronously or efficiently.
11. Execute workspace-scoped operation.

Never support API keys in URL query strings.

---

# 48. Webhook backend

Implement:

```text
/api/public/webhooks/facebook
/api/public/webhooks/instagram
/api/public/webhooks/pinterest
/api/public/webhooks/youtube
/api/public/webhooks/snapchat
```

Each webhook must:

* Verify provider signature
* Validate timestamp
* Prevent replay
* Deduplicate event ID
* Limit body size
* Parse safely
* Sanitize stored payload
* Return provider-required acknowledgement quickly
* Process heavy work after acknowledgement
* Update account or publishing health
* Append job events where relevant

Do not accept unverified webhook payloads.

---

# 49. Support APIs

Keep support endpoints under:

```text
src/routes/api/public/*
```

but protect them correctly.

“Public” means publicly addressable, not unauthenticated.

Use:

* OAuth state
* Webhook signatures
* Internal runner secret
* API keys
* Authenticated sessions

depending on endpoint purpose.

---

# 50. Admin audit logging

Audit these actions:

* User registration
* Workspace creation
* OAuth started
* OAuth completed
* OAuth failed
* Account connected
* Account disconnected
* Account reconnected
* Token refresh
* Token refresh failed
* Default account changed
* Media deleted
* Post created
* Post updated
* Post scheduled
* Publish submitted
* Job started
* Job completed
* Job failed
* Retry requested
* Job cancelled
* Role changed
* User suspended
* User restored
* Platform paused
* Platform resumed
* Health threshold changed
* API key created
* API key rotated
* API key revoked

Do not store secrets in audit metadata.

---

# 51. TanStack Query integration

Create centralized query-key factories.

Example:

```ts
export const accountKeys = {
  all: ['social-accounts'] as const,
  workspace: (workspaceId: string) =>
    [...accountKeys.all, workspaceId] as const,
  detail: (workspaceId: string, accountId: string) =>
    [...accountKeys.workspace(workspaceId), accountId] as const,
}

export const postKeys = {
  all: ['posts'] as const,
  history: (
    workspaceId: string,
    filters: PostHistoryFilters
  ) => [...postKeys.all, workspaceId, 'history', filters] as const,
  detail: (workspaceId: string, postId: string) =>
    [...postKeys.all, workspaceId, postId] as const,
  job: (workspaceId: string, jobId: string) =>
    [...postKeys.all, workspaceId, 'job', jobId] as const,
}
```

Do not use unstable objects without normalization.

Set appropriate stale times:

* Platform metadata: long
* Profile: medium
* Connected accounts: moderate
* Dashboard summary: short to moderate
* Active publishing job: realtime or short polling
* Completed history: longer
* Admin health: controlled

After mutations, invalidate only affected queries.

Do not invalidate every query globally.

---

# 52. Server-function frontend usage

Use the project’s pattern:

```ts
const serverFn = useServerFn(someServerFunction)

const query = useQuery({
  queryKey,
  queryFn: () => serverFn({ data: input }),
})
```

For mutations:

```ts
const mutation = useMutation({
  mutationFn: (input) => serverFn({ data: input }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey })
  },
})
```

Match the exact TanStack Start API already used in the repository.

Do not create a second API wrapper when server functions already solve the use case.

Use public routes only for:

* OAuth callbacks
* Webhooks
* Internal runner
* External support API
* API-key endpoints

---

# 53. Replace demo data safely

Inspect:

```text
src/lib/postflow-data.ts
```

Separate:

* Static platform metadata
* Demo content

Keep static metadata if useful.

Remove demo content imports from production pages after those pages use real backend queries.

Do not delete demo data until no production route depends on it.

Do not leave fallback demo posts that appear as real user data.

Empty database states must show proper empty-state UI.

---

# 54. Error handling

Create a normalized safe error format:

```ts
type AppError = {
  code: string
  message: string
  field?: string
  retryable?: boolean
  action?: 'retry' | 'reconnect' | 'edit' | 'contact_support'
}
```

Map internal failures to safe user messages.

Examples:

```text
This account needs to be reconnected.

The selected account does not have publishing permission.

This media format is not supported for this destination.

Pinterest requires a board.

YouTube requires a title.

This platform is temporarily paused.

Publishing is delayed because the provider rate limit was reached.

Your session has expired. Sign in again.

You do not have permission to perform this action.
```

Never expose:

* Stack traces
* SQL messages
* Encryption errors
* Raw HTTP headers
* OAuth codes
* Tokens
* Provider secrets
* Internal service URLs
* Full private provider responses

---

# 55. Frontend loading states

Every real-data page must include:

* Initial loading skeleton
* Empty state
* Error state
* Retry action
* Mutation loading state
* Disabled repeated actions
* Success feedback

Do not use one full-screen spinner for the entire authenticated app.

Use section-level skeletons.

Preserve element dimensions to avoid layout shifts.

---

# 56. Empty states

## Accounts

```text
Connect your first social account to start publishing from PostFlow.
```

Action:

```text
Connect account
```

## Media

```text
Upload your first image or video to start building your media library.
```

## Composer destinations

```text
None of your connected accounts can publish this content.
```

Show the reason per account.

## Calendar

```text
Your scheduled and published posts will appear here.
```

## Post history

```text
Your publishing history will appear here after you publish or schedule a post.
```

## Notifications

```text
You have no new notifications.
```

---

# 57. Performance requirements

Follow existing project performance rules:

* No backdrop blur on scrolling surfaces.
* Paginate long lists.
* Debounce search.
* Select explicit database columns.
* Add indexes for new filters and sorts.
* Lazy-load heavy admin components.
* Do not mount full provider payloads in list pages.
* Do not render full media originals in grids.
* Do not poll while realtime connection is healthy.
* Stop polling after job completion.
* Avoid nested scroll containers.
* Clean up subscriptions and timers.
* Prevent query waterfalls.
* Use route-level code splitting.
* Avoid global state updates that rerender the full app.

---

# 58. Scroll and interaction optimization

Do not add scroll-linked animations to backend-connected pages.

Avoid:

* Backdrop blur
* Fixed animated backgrounds
* Parallax
* Infinite decorative animation
* Full-page filters
* Large shadow animation

Use only:

* Transform
* Opacity

for lightweight motion.

Any scroll listener must:

* Be passive where possible
* Use `requestAnimationFrame`
* Clean up on unmount
* Avoid continuous React state updates

---

# 59. Responsive requirements

Test all pages at:

* 320px
* 360px
* 375px
* 390px
* 412px
* 768px
* 1024px
* 1280px
* 1440px

Requirements:

* No horizontal overflow
* No clipped dialogs
* No fixed-width desktop tables on mobile
* Cards replace tables where necessary
* Long IDs wrap safely
* Buttons remain reachable
* Composer works with mobile keyboard
* Account-selection dialog stays inside viewport
* Publishing progress remains readable
* Admin job inspector is responsive

Do not hide layout defects using global `overflow-x: hidden`.

Fix the source of overflow.

---

# 60. Accessibility requirements

Maintain:

* Keyboard navigation
* Visible focus
* Proper labels
* Focus trapping in dialogs
* Escape-to-close where safe
* Screen-reader-friendly status text
* Accessible platform names
* Error-to-field associations
* Live publishing updates
* Reduced-motion support
* 44px minimum touch targets

Status cannot depend on color alone.

---

# 61. Security requirements

Required protections:

* Authentication middleware
* Workspace authorization
* Row-level security
* Server-side role assertion
* OAuth state validation
* OAuth state expiry
* OAuth state single use
* PKCE where supported
* AES-256-GCM token encryption
* API-key hashing
* Signed media URLs
* Storage ownership checks
* File-signature validation
* Webhook signature validation
* Replay prevention
* Request body-size limits
* Zod input validation
* Rate limiting
* Idempotency
* Row locking
* Safe redirects
* Secure cookies
* Secret redaction
* Audit logging

Never place backend credentials in `VITE_*` variables.

---

# 62. Backend secrets

Use backend secret storage for:

```text
META_OAUTH_CLIENT_ID
META_OAUTH_CLIENT_SECRET

PINTEREST_OAUTH_CLIENT_ID
PINTEREST_OAUTH_CLIENT_SECRET

GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET

SNAPCHAT_OAUTH_CLIENT_ID
SNAPCHAT_OAUTH_CLIENT_SECRET

POSTFLOW_TOKEN_ENCRYPTION_KEY
POSTFLOW_INTERNAL_RUNNER_SECRET
```

Additional provider-specific webhook secrets may be added.

Do not:

* Hardcode secrets
* Commit secrets
* Send secrets to browser
* Store plaintext tokens
* Print secrets in logs
* Use fake credentials

---

# 63. OAuth callback configuration

Use:

```text
https://<published-domain>/api/public/oauth/callback/facebook
https://<published-domain>/api/public/oauth/callback/instagram
https://<published-domain>/api/public/oauth/callback/pinterest
https://<published-domain>/api/public/oauth/callback/youtube
https://<published-domain>/api/public/oauth/callback/snapchat
```

Also configure the preview domain where supported.

Generate callback URLs from trusted backend configuration.

Never accept an arbitrary callback URL from frontend input.

---

# 64. Database transactions

Use transactions for:

* User workspace initialization
* Connecting selected accounts
* Disconnecting shared provider connections
* Draft post and destination creation
* Publish job creation
* Scheduling
* Job claim
* Provider result updates
* Parent status recalculation
* API-key rotation
* Role changes
* Platform pause or resume

Do not leave partially created parent and child rows after failure.

---

# 65. Parent status calculation

Create a server helper that recalculates the post and job status from destination statuses.

Example rules:

* All destinations published → `published`
* Some published and some failed → `partially_published`
* All failed → `failed`
* One or more active and none failed terminally → `publishing`
* All cancelled → `cancelled`
* User action required → `requires_attention`
* Scheduled and not due → `scheduled`

Use one centralized helper.

Do not repeat status logic in multiple server functions and frontend components.

---

# 66. Safe provider-response storage

Before storing provider responses:

* Remove tokens
* Remove cookies
* Remove authorization headers
* Remove signed URLs where sensitive
* Remove personal data not required for debugging
* Truncate very large nested objects
* Limit total payload size
* Store only operationally useful fields

Normal members receive:

* Safe error code
* Safe error message
* Retryability
* Required action

Admins and support may receive sanitized diagnostic fields.

---

# 67. Testing requirements

Add or update tests.

## Authentication

* Register
* Login
* Google login
* Unauthenticated route redirect
* Profile initialization
* Workspace initialization
* Role cannot be supplied by client

## RLS

* User cannot read another workspace
* User cannot update another workspace
* Support cannot decrypt tokens
* Member cannot use admin mutations
* Admin write creates audit record

## OAuth

* Valid callback
* Invalid state
* Expired state
* Consumed state
* Missing code
* User cancellation
* Token exchange failure
* Duplicate account prevention
* Reconnection updates existing record

## Media

* Signed upload
* Invalid MIME
* Oversized file
* Workspace ownership
* Deleted media cannot publish

## Composer

* Draft create
* Draft update
* Destination save
* Platform override save
* Validation failure
* Publish submission
* Schedule submission

## Publishing

* One successful destination
* Multiple successful destinations
* Partial success
* Complete failure
* Idempotent double submission
* Row locking
* Rate-limit delay
* Token refresh
* Retry schedule
* Retry limit
* Reconnection required
* Admin platform pause

## Realtime

* Job event updates frontend cache
* Polling stops while realtime is active
* Polling fallback works
* Subscription cleanup works

## Admin

* Role change
* User suspension
* Platform pause
* Failed-job retry
* API-key creation
* API-key secret shown once

---

# 68. Implementation sequence

Implement in this order.

## Phase 1 — Repository audit

* Inspect existing routes
* Inspect existing migrations
* Inspect existing server functions
* Inspect existing RLS
* Inspect provider adapters
* Inspect QueryClient defaults
* Inspect demo-data dependencies
* Identify incomplete actions
* Identify frontend mock states

## Phase 2 — Database completion

* Add missing columns
* Add constraints
* Add indexes
* Add RLS
* Add security functions
* Add audit support
* Add realtime publication configuration

## Phase 3 — Authentication and workspace

* Connect login
* Connect register
* Initialize profile
* Initialize workspace
* Protect routes
* Connect role data

## Phase 4 — OAuth and accounts

* Complete OAuth starts
* Complete callback routes
* Complete account discovery
* Connect selection dialog
* Connect refresh
* Connect disconnect
* Connect reconnect
* Connect default account

## Phase 5 — Media

* Complete private storage
* Add signed upload
* Validate media
* Connect Media Library
* Connect Composer media selection

## Phase 6 — Composer

* Connect draft creation
* Connect autosave
* Connect destinations
* Connect overrides
* Connect validation
* Connect schedule and publish actions

## Phase 7 — Publishing engine

* Complete parent jobs
* Complete destination jobs
* Complete runner
* Complete provider adapters
* Add idempotency
* Add locking
* Add rate limiting
* Add retries
* Add token refresh

## Phase 8 — Realtime and history

* Complete realtime job events
* Connect progress dialog
* Connect Post History
* Connect Calendar
* Connect Dashboard summaries

## Phase 9 — Admin

* Connect Overview
* Connect Users
* Connect Failed Jobs
* Connect Integrations
* Connect Health
* Connect API Keys
* Connect Logs

## Phase 10 — Optimization

* Remove demo queries
* Narrow selected columns
* Add pagination
* Add debounce
* Remove duplicate queries
* Stop unnecessary polling
* Lazy-load heavy components
* Fix horizontal overflow

## Phase 11 — Verification

Run:

```bash
bun run build
```

Then verify:

* No TypeScript errors
* No build errors
* No console errors
* No unhandled promise rejections
* No cross-workspace data access
* No secrets in network responses
* No secret values in client bundle
* No duplicate publishing
* No fake publishing success
* No hardcoded color literals
* No horizontal overflow

---

# 69. Required completion report

After implementation, provide a concise report containing:

## Completed backend work

* Migrations added
* RLS policies added
* Server functions completed
* Public routes completed
* Provider adapters completed
* Publishing runner completed
* Realtime completed

## Frontend connections

* Dashboard
* Accounts
* Composer
* Media
* Calendar
* Post history
* Settings
* Admin pages

## Remaining external setup

List only genuine provider-side tasks, such as:

* Add real OAuth credentials
* Register callback URLs
* Request provider app approval
* Configure provider webhook
* Enable storage
* Enable `pg_cron`
* Add internal runner secret

## Verification

* Build result
* Test result
* RLS result
* OAuth result
* Publishing result
* Responsive result
* Security result

Do not claim a provider integration is complete if external approval or credentials are still missing.

---

# 70. Definition of done

The implementation is complete only when:

* Registration and login use real authentication.
* Every user receives a valid workspace.
* `/app` is auth-protected.
* Roles are checked server-side.
* All user data is workspace-scoped.
* Connected Accounts uses real OAuth.
* Tokens are encrypted and server-only.
* Multiple accounts per platform are supported.
* Disconnect and reconnect work without losing history.
* Media uploads to private storage.
* Media Library uses real database data.
* Composer saves real drafts.
* Platform overrides persist.
* Validation runs per destination.
* Publish Now creates real jobs.
* Schedule creates real due jobs.
* Runner uses row locking.
* Idempotency prevents duplicate posts.
* Retries use exponential backoff.
* Token refresh runs automatically.
* Rate limits delay rather than corrupt jobs.
* Provider results are stored independently.
* Partial publishing success is represented correctly.
* Realtime updates the frontend.
* Polling stops while realtime works.
* Calendar displays real scheduled and published posts.
* Post History displays real destination outcomes.
* Dashboard uses real summaries.
* Settings use real mutations.
* Notifications use real database records.
* Admin pages use real backend functions.
* API-key secrets are shown only once.
* Every sensitive action is audited.
* RLS blocks other workspaces.
* Secrets never reach the browser.
* No production page uses demo data.
* No unsupported provider action is shown as successful.
* The application builds successfully.
* The White and Moonstone design system remains unchanged.
* No page has horizontal overflow.
* Existing performance optimizations remain intact.

Complete the backend and frontend integration as a production-ready extension of the existing PostFlow repository. Preserve existing working code, repair incomplete areas, replace mock behavior with real operations, and clearly report any external provider setup that cannot be completed from the codebase alone.
