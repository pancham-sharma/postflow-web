# Google OAuth redirect configuration

PostFlow uses two Google OAuth clients for different purposes. Keep the
credentials separate even when both clients belong to the same Google Cloud
project.

## YouTube channel connection

PostFlow performs this OAuth flow on the server. Configure the YouTube client
with these **Authorized redirect URIs**:

- Local: `http://127.0.0.1:8080/api/public/oauth/callback/youtube`
- Optional localhost alias: `http://localhost:8080/api/public/oauth/callback/youtube`
- Production: `https://YOUR-POSTFLOW-DOMAIN/api/public/oauth/callback/youtube`

Use only the URL matching the `POSTFLOW_APP_URL` of the running deployment. An
OAuth redirect URI must match exactly, including protocol, hostname, port,
path, and trailing slash.

## Google account sign-in through Supabase

Configure the Google sign-in client with these values:

### Authorized JavaScript origins

- Local: `http://127.0.0.1:8080`
- Optional localhost alias: `http://localhost:8080`
- Production: `https://YOUR-POSTFLOW-DOMAIN`

### Authorized redirect URI

- `https://dbpuzlytaedlpsqxwrnf.supabase.co/auth/v1/callback`

Paste this client's ID and secret into **Supabase Dashboard -> Authentication
-> Providers -> Google**, then enable the provider.

In **Supabase Dashboard -> Authentication -> URL Configuration**, add these
application return URLs:

- `http://127.0.0.1:8080/auth/callback`
- `http://localhost:8080/auth/callback` if the localhost alias is used
- `https://YOUR-POSTFLOW-DOMAIN/auth/callback`

The Google Cloud redirect points to Supabase. The Supabase redirect allow list
points back to PostFlow; these are intentionally different URLs.
