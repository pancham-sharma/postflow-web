# PostFlow

Upload your media once, publish it everywhere. PostFlow is a multi-platform social
publishing workspace for Instagram, Facebook, Pinterest, YouTube and Snapchat,
with scheduling, a content calendar, a media library and a full admin console.

---

## 1. Brand & design system

Two colors only — no greys, no accent palettes:

| Token        | Value                                     | Use                                      |
| ------------ | ----------------------------------------- | ---------------------------------------- |
| White        | `#FFFFFF` / `oklch(1 0 0)`                | Page/card surfaces, text on Hunter green |
| Hunter green | `#355E3B` / `oklch(0.4415 0.0735 147.66)` | Text, borders, primary actions, sidebar  |

- Everything else is an **opacity or gradient variation** of those two.
- All colors live as semantic tokens in `src/styles.css` (`--background`, `--primary`,
  `--sidebar`, …). Components never hardcode color classes.
- Type: **DM Sans** (loaded via `<link>` in `src/routes/__root.tsx`).
- Radii: 10 / 14 / 16 / 24 / 28 / 32 / 40 px. Shadows: `shadow-soft`, `shadow-lift`.
- Custom utilities: `surface-strong`, `surface-light`, `mesh-vanilla`, `hatch`, `grid-lines`.
- Status is never communicated by hue alone — it uses icons, hatching, dashed borders
  and solid fills so it stays accessible inside the two-color rule.

> Note: the former cream/Vanilla base (`#FFEBAF`) is now **white**. The `--vanilla`
> variable name is kept (aliased as `--color-paper`) so existing classes keep working.

---

## 2. Tech stack (as implemented here)

| Layer    | What is running                                                                    |
| -------- | ---------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn UI, lucide icons             |
| Routing  | TanStack Start / TanStack Router (file-based routes in `src/routes`)               |
| Data     | TanStack Query                                                                     |
| Backend  | Lovable Cloud — Postgres + Auth + server functions (`createServerFn`)              |
| Jobs/API | Server routes under `src/routes/api/public/*` for OAuth callbacks and support APIs |

The PRD named Django + Celery. This build implements the same product surface on
Lovable Cloud (Postgres, row-level security, server functions) instead, so there is
no separate Python service to host.

---

## 3. What is already built

### Public

- **Landing page** (`/`) — value proposition, platform strip, feature sections.
- **Login / Register** (`/login`, `/register`) — email + password and Google sign-in.

### Workspace (auth-gated under `/app`)

- **Dashboard** — upcoming posts, connected account summary, quick actions.
- **Composer** (`/app/create`) — one caption + per-platform overrides, media picker,
  schedule or publish now.
- **Media library** (`/app/media`) — reusable image/video assets with metadata.
- **Calendar** (`/app/calendar`) — month view of scheduled and published posts.
- **Post history** (`/app/posts`) — per-platform outcome of every publish.
- **Live publishing** — per-platform upload/processing results stream into post
  history in real time; queued, scheduled, processing and retry jobs run automatically.
- **Connected accounts** (`/app/accounts`) — real OAuth connect / refresh / disconnect
  for all six platforms; tokens are encrypted (AES-256-GCM) server-side and never
  reach the browser.
- **Settings** (`/app/settings`) — profile and workspace preferences.

### Admin console (`/app/admin`, role-gated)

- **Overview** — users, 24h job success rate, paused platforms.
- **Users** — search, grant/revoke `admin` / `support` / `member`, suspend accounts.
- **Failed jobs** — filter by status/platform, full attempt **timeline**, per-attempt
  provider responses, **payload diff between retries**, requeue, cancel and
  **retry with exponential backoff**.
- **Integrations** — per-platform publishing toggle, maintenance mode, rate limits, notices.
- **Health** — sync status, last webhook run, last poll run, consecutive failures,
  expiring/expired permissions and editable alert thresholds.
- **API keys** — scoped `pfsk_` keys (hashed at rest, secret shown once), rotate,
  revoke, with last-used time, last-used IP and request counts.
- **Logs** — admin audit trail plus public endpoint reference.

### Security model

- Roles live in a separate `user_roles` table and are checked with a `has_role`
  security-definer function — never from client storage.
- Row-level security on every table; server functions assert roles before writing.
- OAuth tokens and API-key secrets are encrypted/hashed; only prefixes are readable.

---

## 4. What can be implemented next

**Publishing engine**

- Add provider webhooks where available to complement the existing live database updates.
- Add byte-level progress events for platforms that expose upload progress APIs.

**Content features**

- Video trimming/aspect-ratio presets per platform (Reels, Shorts, Pins).
- AI caption and hashtag generation, alt-text suggestions.
- Approval workflow (draft → review → scheduled) and post templates.
- Bulk CSV import and a drag-and-drop calendar.

**Insights**

- Post-publish metrics per platform, best-time-to-post recommendations, exportable reports.

**Teams & billing**

- Workspaces with multiple members and per-brand account groups.
- Plan limits and Stripe/Paddle subscriptions.

**Ops**

- Webhook receivers per platform to close the health loop.
- Alert delivery (email/Slack) when a platform crosses a threshold.
- Storage bucket for uploaded media with signed URLs.

---

## 5. Project layout

```text
src/
├─ routes/
│  ├─ index.tsx, login.tsx, register.tsx      public pages
│  ├─ _authenticated/                          auth-gated workspace + admin console
│  └─ api/public/                              OAuth callbacks, support API
├─ components/                                 UI + admin widgets (JobInspector, StatusBadge)
├─ lib/
│  ├─ *.functions.ts                           server functions (client-safe imports)
│  ├─ *.server.ts                              server-only helpers (crypto, API keys)
│  ├─ admin-types.ts, admin-helpers.ts         shared admin types and mappers
│  └─ postflow-data.ts                         platform metadata and demo content
└─ styles.css                                  design tokens and custom utilities
```

## 6. Local development

```bash
bun install
bun run dev     # http://localhost:8080
```

## 7. OAuth setup

For each platform, add these callback URLs in the provider's developer console:

```
https://<your-published-domain>/api/public/oauth/callback/<platform>
https://<your-preview-domain>/api/public/oauth/callback/<platform>
```

Platform client IDs and secrets are stored as backend secrets, never in the codebase.

---

## 8. How to add a new feature or change existing code

Anything in this app can be extended — here is where each type of change goes.

### 8.1 Add a new page

1. Create a file in `src/routes/`. File name = URL
   (`_authenticated/app.reports.tsx` → `/app/reports`, auth-gated).
2. Export `createFileRoute(...)({ head, component })`. Give every page its own
   `head()` with a unique title + description.
3. Add the link to the nav array in `src/routes/_authenticated/app.tsx`.
4. Never edit `src/routeTree.gen.ts` — it regenerates itself.

### 8.2 Add data / backend logic

1. Add a migration (tables in `public`, then `GRANT`, then `ENABLE ROW LEVEL
SECURITY`, then policies). All rows are scoped by `workspace_id`.
2. Add a server function in `src/lib/<area>.functions.ts` using
   `createServerFn` + `.inputValidator(zod)` + `.middleware([requireSupabaseAuth])`.
3. Keep secrets, crypto and provider calls in `*.server.ts` files — those never
   reach the browser.
4. Read it in the UI with TanStack Query (`useServerFn` + `useQuery`), and
   invalidate the query key after mutations.

### 8.3 Add a new social platform

1. Add the platform metadata to `src/lib/social-platforms.ts`.
2. Add its OAuth provider config to `src/lib/social-oauth.server.ts`
   (auth URL, token URL, scopes, PKCE if required).
3. Create `src/lib/provider-adapters/<platform>.server.ts` implementing the
   adapter contract in `provider-adapters/types.ts`, and register it in
   `provider-adapters/index.server.ts`.
4. Add its media rules to `src/lib/publishing-validation.server.ts`.
5. Store the client id/secret as backend secrets and register the callback URL
   (section 7).

### 8.4 Add an admin control

Admin pages live in `src/routes/_authenticated/app.admin.*.tsx`; shared types in
`src/lib/admin-types.ts`, server logic in `src/lib/admin.functions.ts`. Every
admin server function must call the role assertion helper before writing, and
every write should append an `admin_audit_logs` row.

### 8.5 Add an agent (MCP) tool

Create `src/lib/mcp/tools/<tool>.ts` with `defineTool`, use `supabaseForUser(ctx)`
so it acts as the signed-in user, then register it in the `tools` array in
`src/lib/mcp/index.ts`.

### 8.6 Change design / styling

Edit tokens in `src/styles.css` only. Components must use semantic classes
(`bg-primary`, `text-muted-foreground`, `surface-strong`) — never `text-white`,
`bg-black` or hex values. The two-color rule (White + Hunter green) applies to every
new screen; convey status with icons, hatching, dashed borders and fills.

### 8.7 Performance rules to keep

- No `backdrop-blur` on scrolling or sticky surfaces.
- Paginate long lists instead of mounting every row.
- Debounce search inputs (`src/hooks/use-debounced-value.ts`).
- Select explicit columns in list queries; never `select("*")` for tables with
  large JSON columns.
- Add a database index for every new filter/sort path.

### 8.8 Before you ship

```bash
bun run build     # must pass
```

Check the preview for console errors, confirm RLS blocks other workspaces, and
confirm no new color literals were introduced.

---

## 9. Change log

- **README expanded** — full route map, database/table reference, AI model list,
  every secret name, and a deleted/replaced log (sections 10–14).
- **AI error transparency** — gateway 402/429 responses now surface the real
  reason in the composer instead of a generic "could not generate" message.
- **Resilient audio mixing (media processor)** — a slow or timed-out mixing
  worker can no longer fail a YouTube (or any) upload:
  - mixing is **skipped entirely** when no extra music / voice-over / SFX track
    is attached — the original upload is published untouched;
  - the source video is verified in storage (exists, non-empty, video MIME)
    before any processing starts;
  - each processor call has a 2-minute request budget, up to 3 attempts with
    5s / 20s / 45s backoff;
  - Cloudflare/proxy timeouts (502, 504, **524**) and network drops no longer
    fail the render — the output object is polled from storage for up to 10
    minutes, so a job that actually finished is picked up instead of retried;
  - output keys are deterministic (`<user>/renders/<platform>-<mixHash>.mp4`),
    so retries reuse a finished render instead of re-encoding or duplicating;
  - the rendered file size replaces the original one before upload, keeping
    YouTube's resumable `Content-Length` correct;
  - `media_renders` tracks attempts, start/heartbeat/completion timestamps,
    output size and a structured `error_code`;
  - timeouts classify as **retryable** (`media_processor_timeout`), missing
    source media as permanent with a "re-upload the video" action, and the
    "publish with original audio" retry bypasses the processor completely;
  - structured logs: `[MEDIA_MIX_SKIPPED]`, `[MEDIA_MIX_COMPLETED]`,
    `[MEDIA_MIX_COMPLETED_AFTER_TIMEOUT]`, `[MEDIA_MIX_REUSED]`,
    `[MEDIA_MIX_PROCESSOR_ERROR]`, `[MEDIA_MIX_TRANSPORT_ERROR]`,
    `[MEDIA_MIX_FAILED]`.
- **White rebrand** — cream `#FFEBAF` base replaced with white; `--vanilla`
  kept as an alias so existing classes still work.
- **OAuth connections** — real connect / refresh / disconnect for all six
  platforms, AES-256-GCM encrypted tokens.
- **Admin console** — users, failed jobs with timeline + payload diff + retry
  with backoff, integration toggles, health thresholds, scoped API keys, logs.
- **Publishing engine** — workspaces with workspace-scoped RLS, provider
  adapters, centralized validation, parent/destination jobs with idempotency,
  row locking, automatic minute scheduling and exponential backoff (1, 5, 15, 60, 360 min).
- **YouTube Shorts** — real resumable, chunked video transfer with vertical Short
  metadata, channel verification, safe interrupted-chunk recovery and background
  processing checks, avoiding whole-video memory buffering.
- **Publishing worker repair** — fixed queue claiming for typed destination statuses,
  so publish-now and scheduled uploads are processed automatically again.
- **Realtime dashboard and post history** — live updates for parent jobs, posts and
  each platform destination from upload through provider processing and completion.
- **Composer** — real media upload to the `post-media` bucket, per-platform
  overrides, hashtag normalization, schedule or publish now.
- **Agent integrations (MCP)** — tools for connected accounts, scheduling,
  job inspection and cancellation.
- **Performance pass** — shared QueryClient defaults, blur removal, list
  pagination, isolated composer state, narrowed admin queries, 20 new indexes.
- **Landing hero reel** — five looping 9:16 reels that rotate in the hero frame,
  with a 3D hover tilt and centered playback controls.
- **Background music removed** — the sitewide music player, its floating toggle
  and the Settings track selector were taken out; the hero reel is muted video only.
- **TikTok removed** — platform metadata, OAuth config, provider adapter, UI entries
  and secrets were fully removed. PostFlow now covers five platforms.
- **Baseline migration** — `supabase/migrations/` now holds a generated baseline of
  the full schema (enums, tables, indexes, functions, triggers, grants, RLS, policies).
- **Google sign-in hardening** — client-only auth pages wrapped in `ClientOnly`
  (SSR hydration no longer resets state mid-flow), forced account + consent
  prompts, session verification with one-click retry, and self-healing
  profile/workspace provisioning on first login.
- **Instagram Login credentials** — dedicated `INSTAGRAM_OAUTH_CLIENT_ID` /
  `INSTAGRAM_OAUTH_CLIENT_SECRET`, plus alias support so common alternative
  secret names (`INSTAGRAM_APP_ID`, `FACEBOOK_APP_ID`, `GOOGLE_OAUTH_*`, …)
- **Snapchat OAuth fix** — backend-mediated 302 to
  `accounts.snapchat.com/accounts/oauth2/auth` with PKCE (S256), a single
  `user.display_name` scope, HTTP-only state cookie with timing-safe comparison,
  per-platform redirect-URI overrides and redacted authorize logging.
- **Connect flow unblocked** — `cross-origin-resource-policy` relaxed to
  `cross-origin` so the embedded preview no longer fails with
  `ERR_BLOCKED_BY_RESPONSE` when opening a platform connect flow.
- **Multi-account + renewal** — several accounts per platform, with explicit
  renew/reconnect actions once a token expires.
- **Privacy policy** — public `/privacy` route linked from the landing footer for
  provider app review.

---

## 10. Complete route map

### Public routes

| Path             | File                                                       |
| ---------------- | ---------------------------------------------------------- |
| `/`              | `src/routes/index.tsx` — landing page + hero reels         |
| `/login`         | `src/routes/login.tsx`                                     |
| `/register`      | `src/routes/register.tsx`                                  |
| `/auth/callback` | `src/routes/auth.callback.tsx` — Supabase session hand-off |
| `/privacy`       | `src/routes/privacy.tsx`                                   |

### Workspace routes (auth-gated, `src/routes/_authenticated/`)

| Path                 | File                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `/app`               | `app.index.tsx` — dashboard                                                                      |
| `/app/create`        | `app.create.tsx` — composer + audio studio + AI writer                                           |
| `/app/generator`     | `app.generator.tsx` — idea/title generator                                                       |
| `/app/media`         | `app.media.tsx`                                                                                  |
| `/app/calendar`      | `app.calendar.tsx`                                                                               |
| `/app/posts`         | `app.posts.tsx` — post history + retry                                                           |
| `/app/accounts`      | `app.accounts.tsx` — OAuth connections                                                           |
| `/app/notifications` | `app.notifications.tsx`                                                                          |
| `/app/settings`      | `app.settings.tsx`                                                                               |
| `/app/admin`         | `app.admin.index.tsx` (+ `.users`, `.jobs`, `.platforms`, `.health`, `.keys`, `.logs`, `.music`) |

### HTTP endpoints

| Path                                                  | Purpose                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `/api/public/oauth/connect/$platform`                 | starts a provider OAuth flow (302)                                |
| `/api/public/oauth/callback/$platform`                | provider redirect target (Login Kit / Graph / Google / Pinterest) |
| `/api/public/oauth/snapchat-public-profile/callback`  | Snapchat Business (Public Profile API) redirect target            |
| `/api/public/oauth/facebook/scopes`                   | scope diagnostics for Meta review                                 |
| `/api/public/publishing/run`                          | publishing worker tick (called by `pg_cron`)                      |
| `/api/public/support/job-status`                      | read-only job status probe                                        |
| `/api/ai/source-idea/generate`                        | streaming AI generation endpoint                                  |
| `/mcp`, `/.mcp/list-tools`, `/.mcp/invoke-tool/$tool` | agent (MCP) surface                                               |
| `/.well-known/oauth-protected-resource`               | MCP OAuth discovery                                               |

---

## 11. Database (Lovable Cloud / Postgres)

All tables live in `public`, all have RLS enabled, explicit `GRANT`s and
workspace- or user-scoped policies.

### Tables

| Table                                                        | Holds                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `workspaces`                                                 | one workspace per account owner                                     |
| `workspace_members`                                          | membership + workspace role                                         |
| `workspace_storage`                                          | per-workspace storage usage accounting                              |
| `profiles`                                                   | display name, avatar, locale                                        |
| `user_roles`                                                 | `admin` / `support` / `member` (separate table — never on profiles) |
| `user_preferences`                                           | UI + notification preferences                                       |
| `social_connections`                                         | connected platform accounts, encrypted tokens                       |
| `social_account_events`                                      | connect / refresh / disconnect / expiry audit                       |
| `snapchat_public_profile_connections`                        | Snapchat Business API tokens + capability report                    |
| `oauth_states`                                               | single-use hashed OAuth state + PKCE verifier                       |
| `platform_capabilities`                                      | what each connected account may actually do                         |
| `platform_controls`                                          | admin publishing toggles, maintenance mode, notices                 |
| `platform_health`                                            | sync status, webhook/poll runs, consecutive failures                |
| `provider_rate_limits`                                       | per-provider rate-limit windows                                     |
| `social_posts`                                               | parent post (caption, schedule, derived status)                     |
| `post_platform_contents`                                     | per-platform editable content + validation state                    |
| `social_post_media`                                          | media attached to a post                                            |
| `social_post_destinations`                                   | one row per platform target of a post                               |
| `media_assets`                                               | media library items                                                 |
| `media_folders`                                              | library folders                                                     |
| `media_renders`                                              | audio/video mix renders (attempts, heartbeat, error_code)           |
| `music_tracks`                                               | copyright-safe music catalogue                                      |
| `publishing_jobs`                                            | parent publish job                                                  |
| `publishing_job_destinations`                                | per-platform job destination (claimable queue rows)                 |
| `publishing_attempts`                                        | attempt log with provider responses                                 |
| `publish_jobs`, `publish_job_attempts`, `publish_job_events` | admin job inspector timeline                                        |
| `notifications`                                              | in-app notifications                                                |
| `admin_api_keys`                                             | scoped `pfsk_` keys (hashed; prefix + last-used metadata)           |
| `admin_audit_logs`                                           | every admin write                                                   |

### Database functions

`has_role`, `is_workspace_admin`, `is_workspace_member`, `default_workspace_id`,
`claim_due_publishing_destinations`, `recover_stuck_publishing_destinations`
(all `security definer` where they are used inside RLS policies).

### Storage

- Bucket **`post-media`** — uploads, library assets and rendered outputs
  (`<user>/renders/<platform>-<mixHash>.mp4`), served through signed URLs.

### Scheduling

`pg_cron` calls `/api/public/publishing/run` every minute to claim due
destinations, run retries with backoff (1, 5, 15, 60, 360 min) and recover
stuck rows.

### Migrations

`supabase/migrations/` holds the full history: the initial social-connection and
role/profile migrations, the `20260804183000_baseline_schema.sql` baseline, and
the later incremental migrations (platform content, media renders, Snapchat
Public Profile, YouTube resumable state, indexes).

---

## 12. AI features

All AI runs through the server-only provider in `src/lib/ai-provider.server.ts`.
`OPENAI_API_KEY` is the primary provider credential and `OPENAI_MODEL`
selects the model (default: `gpt-5.6-terra`). The existing Lovable AI Gateway
remains an optional fallback when `OPENAI_API_KEY` is not configured. Neither
credential is exposed to browser code.

| Feature                                                              | Where                                                            | Provider/model                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| Per-platform caption / hashtag writer ("Generate for all platforms") | `src/lib/ai-content.functions.ts`                                | OpenAI / `OPENAI_MODEL`          |
| Title generator                                                      | `src/lib/title-generator.functions.ts`                           | OpenAI / `OPENAI_MODEL`          |
| Source-idea generator                                                | `src/lib/source-idea.server.ts` + `/api/ai/source-idea/generate` | OpenAI / `OPENAI_MODEL`          |
| Audio ducking suggestions                                            | `src/lib/audio-render.server.ts` (media processor)               | rules + processor                |

Provider errors are converted to safe user messages for quota, rate-limit,
authentication, access, and availability failures. Server logs contain only
provider/status/code/type/request-ID metadata; prompts, outputs, headers,
response bodies, and credentials are not logged.

---

## 13. Secrets and keys (names only — values are never in the codebase)

Stored as backend secrets and read inside server handlers only.

| Secret name                             | Used for                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                        | OpenAI AI-writing provider (server-only)                                                       |
| `OPENAI_MODEL`                          | Optional model override; defaults to `gpt-5.6-terra`                                          |
| `LOVABLE_API_KEY`                       | Lovable AI Gateway (managed; rotate from Lovable, not in code)                                 |
| `SUPABASE_SECRET_KEY`                   | Privileged PostFlow server operations (server-only; legacy alias: `SUPABASE_SERVICE_ROLE_KEY`) |
| `YOUTUBE_OAUTH_CLIENT_ID`               | YouTube publishing OAuth                                                                       |
| `YOUTUBE_OAUTH_CLIENT_SECRET`           | YouTube publishing OAuth                                                                       |
| `YOUTUBE_REDIRECT_URI`                  | Exact YouTube OAuth callback URL                                                               |
| `META_OAUTH_CLIENT_ID`                  | Facebook Pages OAuth                                                                           |
| `META_OAUTH_CLIENT_SECRET`              | Facebook Pages OAuth                                                                           |
| `META_PAGES_MANAGE_POSTS_AVAILABLE`     | flag: request `pages_manage_posts` scope or not                                                |
| `INSTAGRAM_OAUTH_CLIENT_ID`             | Instagram Login                                                                                |
| `INSTAGRAM_OAUTH_CLIENT_SECRET`         | Instagram Login                                                                                |
| `INSTAGRAM_REDIRECT_URI`                | Exact HTTPS Instagram OAuth callback URL                                                       |
| `SNAPCHAT_OAUTH_CLIENT_ID`              | Snapchat Login Kit (confidential client)                                                       |
| `SNAPCHAT_OAUTH_CLIENT_SECRET`          | Snapchat Login Kit                                                                             |
| `SNAPCHAT_OAUTH_PUBLIC_CLIENT_ID`       | Snapchat Login Kit (public client, PKCE)                                                       |
| `SNAPCHAT_REDIRECT_URI`                 | Snapchat Login Kit redirect override                                                           |
| `SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID`     | Snapchat Business / Public Profile API                                                         |
| `SNAPCHAT_PUBLIC_PROFILE_CLIENT_SECRET` | Snapchat Business / Public Profile API                                                         |
| `SNAPCHAT_PUBLIC_PROFILE_REDIRECT_URI`  | Snapchat Business callback URL                                                                 |
| `SOCIAL_TOKEN_ENC_KEY`                  | AES-256-GCM key for provider token encryption                                                  |
| `MEDIA_PROCESSOR_URL`                   | FFmpeg media/audio mixing worker                                                               |
| `MEDIA_PROCESSOR_TOKEN`                 | auth token for that worker                                                                     |
| `POSTFLOW_APP_URL`                      | canonical public origin used to build OAuth redirects                                          |

Pinterest OAuth credentials (`PINTEREST_OAUTH_CLIENT_ID` /
`PINTEREST_OAUTH_CLIENT_SECRET`) are **not configured yet** — Pinterest connect
stays disabled until they are added.

Public browser values (safe in code): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

Google sign-in is configured in **Supabase Dashboard -> Authentication ->
Providers -> Google** with a Google OAuth Web Client ID and Client Secret. Those
Google credentials are not browser environment variables. The Google callback
registered in Google Cloud must be the Supabase Auth callback for the project;
the app itself returns to `/auth/callback` after Supabase verifies the login.

> Secrets are never kept in a committed `.env`. They are stored through Lovable's
> secret manager and injected as environment variables at runtime.

Use `.env.example` for variable names and placeholders. Before committing,
run `npm run security:scan`; the repository also runs a staged-file hook and
a full-history Gitleaks GitHub Actions workflow.

---

## 14. What was deleted / replaced along the way

| Removed                                                                                            | Replaced with                                                               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| TikTok platform (metadata, OAuth config, adapter, UI, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`) | five supported platforms: Instagram, Facebook, Pinterest, YouTube, Snapchat |
| Sitewide background music player, floating toggle, Settings track selector, `bg-music.mp3` usage   | muted hero reels only                                                       |
| Old single landing hero video                                                                      | five rotating 9:16 reels (`reel-1…5.mp4`) with 3D tilt                      |
| Cream `#FFEBAF` base color                                                                         | white `#FFFFFF` (`--vanilla` kept as alias)                                 |
| "Failed" status for Snapchat manual sharing                                                        | dedicated `action_required` status + share card                             |
| Whole-video in-memory YouTube upload                                                               | resumable chunked upload with progress persistence                          |
| Always-on audio mixing                                                                             | mixing skipped when no extra track is attached                              |
| Old Snapchat client IDs/redirects                                                                  | current Login Kit + Public Profile OAuth apps                               |
| Direct per-feature gateway calls                                                                    | one server-only provider with OpenAI primary and Lovable fallback           |
