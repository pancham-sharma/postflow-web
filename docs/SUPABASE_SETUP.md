# PostFlow Supabase setup

## Application environment

PostFlow is a Vite/TanStack Start application, so browser variables must use
the `VITE_` prefix:

```env
VITE_SUPABASE_URL=https://dbpuzlytaedlpsqxwrnf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_PROJECT_ID=dbpuzlytaedlpsqxwrnf
```

For server-only profile/workspace provisioning, set one of these in the
deployment secret manager. Never prefix it with `VITE_` or `NEXT_PUBLIC_`:

```env
SUPABASE_SECRET_KEY=your-rotated-secret-key
# Legacy alternative: SUPABASE_SERVICE_ROLE_KEY
```

## Apply the database schema

The SQL migrations under `supabase/migrations` create PostFlow's tables,
indexes, triggers, Row Level Security policies, and private Storage buckets.
From this project folder, authenticate and apply them to the linked project:

```sh
npx supabase login
npx supabase link --project-ref dbpuzlytaedlpsqxwrnf
npx supabase db push --dry-run
npx supabase db push
```

Supabase CLI login requires a Supabase personal access token. Linking can also
prompt for the project's database password.

## Enable Google login

Create a **Web application** OAuth client in Google Cloud and configure:

- Authorized JavaScript origins:
  - `http://127.0.0.1:8080`
  - the deployed PostFlow origin, for example `https://app.example.com`
- Authorized redirect URI:
  - `https://dbpuzlytaedlpsqxwrnf.supabase.co/auth/v1/callback`

Then open **Supabase Dashboard -> Authentication -> Providers -> Google**,
enable Google, and paste the Google Client ID and Client Secret.

Under **Authentication -> URL Configuration**, add these application return
URLs:

- `http://127.0.0.1:8080/auth/callback`
- `http://localhost:8080/auth/callback` if localhost is also used
- `https://your-production-domain/auth/callback`

## Security note

Any Supabase secret key shown in a screenshot or chat must be revoked and
replaced. Store the replacement only in a server-side secret manager. The
publishable key is intended for the browser because database access is guarded
by Row Level Security policies.
