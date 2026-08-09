# Fix "Authorization Error — Failed to load authorization data" (Snapchat)

## What this error actually is

That screen is rendered by Snapchat itself, before any consent is shown. Snapchat loads the authorization request in the browser and refuses it. It never reaches PostFlow, so nothing in our OAuth code is failing — Snapchat is rejecting the `client_id` + `redirect_uri` + `scope` combination it received.

What I verified in this project:

- Snapchat is fully configured on our side: client ID, client secret, public client ID and redirect URI secrets are all present and non-placeholder.
- The redirect URI we send is `https://project--63566379-6adc-42e4-9269-80dc750bf7b8-dev.lovable.app/api/public/oauth/callback/snapchat`.
- We send exactly one scope, `user.display_name`, with PKCE (S256) — the minimal valid Login Kit request.
- Both the confidential and the public client ID return only Snapchat's generic page shell; Snapchat reveals the rejection client-side, so the exact cause has to be confirmed in the Snapchat developer portal.

Given that, the cause is almost certainly one of three things in your Snapchat app, not in the code:

1. The redirect URI above is not registered byte-for-byte under the Staging config.
2. The Display Name scope is not enabled for that client.
3. Your Snapchat account is not added as a demo/test member — Staging clients only work for listed members.

## What I'll do in the app

1. Add a Snapchat self-check panel on the accounts page showing the exact redirect URI and client ID prefix we will send, with a copy button, so the portal value can be pasted without typos.
2. Keep the connect flow on the confidential client ID consistently, and log server-side which client ID variant was used, so switching to the public client later is a one-secret change instead of guesswork.
3. Improve the failure path: show a PostFlow-side help card when a Snapchat connect attempt never returns, listing the three portal checks above, instead of leaving the user on Snapchat's dead-end page.

## What you need to do in the Snapchat portal

These cannot be done from code:

- Open your Snapchat app → Staging config.
- Under OAuth2 redirect URIs add exactly: `https://project--63566379-6adc-42e4-9269-80dc750bf7b8-dev.lovable.app/api/public/oauth/callback/snapchat` (https, no trailing slash, exact case).
- Enable the Display Name scope.
- Under demo/test members, add the Snapchat account you sign in with.
- Save, wait about a minute, then retry Connect.

If you would rather use the published URL instead of the dev host, say so and I will switch `SNAPCHAT_REDIRECT_URI` to that origin — the portal entry must then match the published URL instead.

## Technical notes

- Files touched: `src/routes/_authenticated/app.accounts.tsx` (self-check panel and post-failure help card) and `src/routes/api/public/oauth/connect.$platform.ts` (client-ID selection logging only).
- No database, scope, or token-exchange changes. `SNAPCHAT_OAUTH_PUBLIC_CLIENT_ID` stays unused unless you ask to switch to a public client.