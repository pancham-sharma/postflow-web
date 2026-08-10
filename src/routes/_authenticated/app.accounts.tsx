import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, PlugZap, AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  disconnectConnection,
  listMyConnections,
  preflightConnect,
  refreshConnection,
  startPlatformConnect,
  getOAuthPlatformStatus,
  testConnection,
} from "@/lib/social-connections.functions";
import { checkConnectionHealthFn } from "@/lib/social-connections.functions";
import { platformMap, platforms } from "@/lib/postflow-data";
import type { SocialConnection, SocialPlatform } from "@/lib/social-platforms";
import { FacebookPagePicker } from "@/components/accounts/facebook-page-picker";
import { SnapchatPublicProfileCard } from "@/components/accounts/snapchat-public-profile-card";
import { cn } from "@/lib/utils";
import { takeComposerReturn } from "@/lib/composer-draft";
import { clientErrorMessage } from "@/lib/client-error-message";

export const Route = createFileRoute("/_authenticated/app/accounts")({
  head: () => ({
    meta: [
      { title: "Social Accounts — PostFlow" },
      {
        name: "description",
        content:
          "Connect, reconnect or disconnect Instagram, Facebook, Pinterest, YouTube and Snapchat accounts.",
      },
      { property: "og:title", content: "Social Accounts — PostFlow" },
      {
        property: "og:description",
        content: "Token expiry, permission status and last sync for every connected account.",
      },
    ],
  }),
  component: AccountsPage,
});

const statusLabel = {
  connected: "Connected",
  expiring: "Expiring soon",
  expired: "Permission expired",
} as const;

/** Expected consent-screen hosts, checked before we ever navigate away. */
const AUTHORIZE_HOSTS: Record<SocialPlatform, string> = {
  instagram: "www.instagram.com",
  facebook: "www.facebook.com",
  pinterest: "www.pinterest.com",
  youtube: "accounts.google.com",
  snapchat: "accounts.snapchat.com",
};

/** Human-readable guidance per callback failure code. */
const ERROR_SCREENS: Record<string, { title: string; hint: string }> = {
  state_invalid: {
    title: "Authorization link expired",
    hint: "The security token for this attempt is no longer valid — this happens if the consent screen sat open for more than 15 minutes, or if it was reloaded. Start a fresh connection.",
  },
  code_expired: {
    title: "Authorization code expired",
    hint: "The provider's one-time code was already used or timed out before the exchange completed. Retrying issues a new code.",
  },
  token_exchange_failed: {
    title: "Token exchange failed",
    hint: "The provider declined to issue a token. Check the developer app credentials and that the callback URL shown by the pre-flight check is registered exactly.",
  },
  account_discovery_failed: {
    title: "Account details unavailable",
    hint: "Authorization succeeded, but the platform did not let PostFlow read the connected account. Confirm the account type and the permissions granted to the app, then reconnect.",
  },
  connection_storage_failed: {
    title: "Account could not be saved",
    hint: "Authorization succeeded, but PostFlow could not save the connection. Retry the connection; if it repeats, check the server logs for a connection-storage failure.",
  },
  redirect_uri_mismatch: {
    title: "Redirect URI mismatch",
    hint: "The callback URL PostFlow sends is not registered on the provider's app. Run the pre-flight check below to see the exact URL to add.",
  },
  invalid_configuration: {
    title: "Platform not configured",
    hint: "The app ID or app secret for this platform is missing or a placeholder.",
  },
  app_not_found: {
    title: "Developer app not found",
    hint: "The provider rejected the configured app ID or secret.",
  },
  app_not_approved: {
    title: "App not approved for these permissions",
    hint: "The developer app has not been granted the requested API scopes yet.",
  },
  permission_denied: {
    title: "Authorization cancelled",
    hint: "Access was denied on the provider's consent screen — nothing was connected.",
  },
  unknown: {
    title: "Connection failed",
    hint: "Something went wrong completing the connection. Please try again.",
  },
};

function formatDate(value: string | null) {
  if (!value) return "No expiry";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type CallbackError = { code: string; message: string; platform: SocialPlatform | null };
type Preflight = {
  ok: boolean;
  code: string;
  detail: string;
  redirectUri: string;
  clientIdPrefix?: string | null;
};

/**
 * Snapchat renders "Failed to load authorization data" entirely on its own
 * consent page, so no callback ever reaches PostFlow. These are the portal
 * settings that cause it, in the order they are worth checking.
 */
const SNAPCHAT_PORTAL_CHECKS = [
  "Redirect URI: paste the exact URI below into your Snap app under OAuth2 → Redirect URIs (Staging). No trailing slash, no extra path.",
  "Scopes: enable https://auth.snapchat.com/oauth2/api/user.display_name on the same app; an unapproved scope aborts the consent page before it renders.",
  "Demo/test user: while the app is in Staging, only accounts added under Demo Users can authorize. Add the Snapchat account you are signing in with.",
  "Client ID: staging uses the Confidential Client ID (the one whose secret you saved). Confirm the prefix below matches that app.",
];

function SnapchatPortalHelp({
  redirectUri,
  clientIdPrefix,
}: {
  redirectUri?: string | undefined;
  clientIdPrefix?: string | null | undefined;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-primary/60 p-4 text-xs">
      <p className="font-semibold">Snapchat portal checklist</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-muted-foreground">
        {SNAPCHAT_PORTAL_CHECKS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      {clientIdPrefix && (
        <p className="mt-2 text-muted-foreground">
          PostFlow is sending client ID <code className="font-mono">{clientIdPrefix}…</code>
        </p>
      )}
      {redirectUri && (
        <code className="mt-2 block break-all rounded-md border border-border px-2 py-1.5">
          {redirectUri}
        </code>
      )}
    </div>
  );
}

function AccountsPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConnections = useServerFn(listMyConnections);
  const startConnect = useServerFn(startPlatformConnect);
  const doRefresh = useServerFn(refreshConnection);
  const doDisconnect = useServerFn(disconnectConnection);
  const doTest = useServerFn(testConnection);
  const doHealth = useServerFn(checkConnectionHealthFn);
  const doPreflight = useServerFn(preflightConnect);
  const fetchInstagramStatus = useServerFn(getOAuthPlatformStatus);
  const [pending, setPending] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ platform: SocialPlatform; url: string } | null>(null);
  const [callbackError, setCallbackError] = useState<CallbackError | null>(null);
  const [preflight, setPreflight] = useState<{
    platform: SocialPlatform;
    result: Preflight;
  } | null>(null);
  const [preflightBusy, setPreflightBusy] = useState<SocialPlatform | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<SocialConnection | null>(null);
  const [showSnapchatHelp, setShowSnapchatHelp] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string; at: string }>
  >({});

  const { data: instagramStatus } = useQuery({
    queryKey: ["oauth-status", "instagram"],
    queryFn: () => fetchInstagramStatus(),
    staleTime: 60_000,
  });

  const {
    data: connections = [],
    isLoading,
    error: connectionsError,
  } = useQuery<SocialConnection[]>({
    queryKey: ["social-connections"],
    queryFn: () => fetchConnections(),
    staleTime: 60_000,
  });

  // Surface the outcome of the OAuth round-trip handled by the callback route.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("connect_error");
    if (!connected && !error) return;
    if (connected) {
      toast.success(`${platformMap[connected as SocialPlatform]?.name ?? connected} connected.`);
      window.sessionStorage.removeItem("pf_snapchat_attempt");
      setCallbackError(null);
      void queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      // Came here mid-composition? Go back with the draft intact.
      const back = takeComposerReturn();
      if (back) {
        window.history.replaceState({}, "", window.location.pathname);
        void navigate({ to: back });
        return;
      }
    }
    if (error) {
      const platform = params.get("connect_platform");
      setCallbackError({
        code: params.get("connect_error_code") ?? "unknown",
        message: error,
        platform: platform && platform in platformMap ? (platform as SocialPlatform) : null,
      });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [queryClient, navigate]);

  // Snapchat can fail on its own consent page ("Failed to load authorization
  // data"), which never redirects back — so no callback error exists. Detect
  // the returning attempt and surface the portal checklist instead of silence.
  useEffect(() => {
    const attempted = window.sessionStorage.getItem("pf_snapchat_attempt");
    if (!attempted) return;
    window.sessionStorage.removeItem("pf_snapchat_attempt");
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "snapchat") return;
    setShowSnapchatHelp(true);
  }, []);

  const isFramed = () => typeof window !== "undefined" && window.top !== window.self;

  /**
   * Top-level, full-page redirect to the provider's own consent page.
   * Never fetched, never framed — providers (Pinterest especially) run bot
   * checks that fail inside a sandboxed iframe or inherited popup.
   * A pre-flight confirms our redirect_uri is registered before we leave.
   */
  const redirectToProvider = useCallback(
    async (platform: SocialPlatform, destination: Window = window) => {
      const check = (await doPreflight({
        data: { platform, origin: window.location.origin },
      })) as Preflight;
      if (!check.ok) {
        setPreflight({ platform, result: check });
        throw new Error(check.detail);
      }
      setPreflight({ platform, result: check });

      const { authorizeUrl, connectUrl } = (await startConnect({
        data: { platform, origin: window.location.origin },
      })) as { authorizeUrl: string; connectUrl?: string };
      // Preferred: top-level navigation to our own backend, which 302s to the
      // provider. Never an AJAX/axios call to the provider's authorize endpoint.
      if (connectUrl) {
        const backend = new URL(connectUrl, window.location.origin);
        if (backend.origin === window.location.origin || backend.protocol === "https:") {
          destination.location.assign(backend.toString());
          return;
        }
      }
      // The URL is generated on the server; confirm it still points at the
      // expected provider before navigating so a bad response can't redirect us.
      const target = new URL(authorizeUrl);
      if (target.protocol !== "https:" || target.hostname !== AUTHORIZE_HOSTS[platform]) {
        throw new Error("Invalid authorization URL.");
      }
      destination.location.assign(target.toString());
    },
    [doPreflight, startConnect],
  );

  const connect = useCallback(
    async (platform: SocialPlatform) => {
      setBlocked(null);
      setCallbackError(null);
      setShowSnapchatHelp(false);
      if (platform === "snapchat") {
        window.sessionStorage.setItem("pf_snapchat_attempt", String(Date.now()));
      }
      setPending(platform);
      try {
        if (isFramed()) {
          // Open synchronously during the click so popup blockers allow it,
          // then send that top-level window straight to the provider. Do not
          // relaunch an unpublished app host, which has no runtime environment.
          const opened = window.open("about:blank", "_blank");
          if (!opened) {
            setBlocked({ platform, url: window.location.href });
            toast.error("Pop-ups are blocked — allow pop-ups and try again.");
          } else {
            opened.opener = null;
            try {
              await redirectToProvider(platform, opened);
              toast.info("Finish authorizing in the new tab, then return here.");
            } catch (error) {
              opened.close();
              throw error;
            }
          }
          setPending(null);
          return;
        }
        await redirectToProvider(platform);
      } catch (error) {
        setPending(null);
        toast.error(error instanceof Error ? error.message : "Could not start authorization.");
      }
    },
    [redirectToProvider],
  );

  // Auto-launch when this page was opened top-level with ?connect=<platform>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("connect");
    if (!requested || !(requested in platformMap)) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (isFramed()) {
      toast.error("Open PostFlow in its own browser tab to connect accounts.");
      return;
    }
    const platform = requested as SocialPlatform;
    setPending(platform);
    toast.info(`Checking configuration for ${platformMap[platform]?.name ?? platform}…`);
    redirectToProvider(platform).catch((error: unknown) => {
      setPending(null);
      toast.error(error instanceof Error ? error.message : "Could not start authorization.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPreflight(platform: SocialPlatform) {
    setPreflightBusy(platform);
    try {
      const result = (await doPreflight({
        data: { platform, origin: window.location.origin },
      })) as Preflight;
      setPreflight({ platform, result });
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pre-flight check failed.");
    } finally {
      setPreflightBusy(null);
    }
  }

  const refreshMutation = useMutation({
    mutationFn: (connectionId: string) => doRefresh({ data: { connectionId } }),
    onSuccess: () => {
      toast.success("Permissions refreshed.");
      void queryClient.invalidateQueries({ queryKey: ["social-connections"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Refresh failed."),
  });

  const testMutation = useMutation({
    // Health probe first (token decrypt + refresh + scopes), then the live API ping.
    mutationFn: async (connectionId: string) => {
      const health = await doHealth({ data: { connectionId } });
      if (!health.ok) return { ok: false, message: health.reason };
      const result = await doTest({ data: { connectionId } });
      return {
        ok: result.ok,
        message: result.ok
          ? health.accessTokenExpiresAt
            ? `${result.message} Authorization valid until ${new Date(health.accessTokenExpiresAt).toLocaleString()}.`
            : result.message
          : result.message,
      };
    },
    onSuccess: (result, connectionId) => {
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          ok: result.ok,
          message: result.message,
          at: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        },
      }));
      if (result.ok) {
        toast.success("Connection is live — profile updated.");
        void queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Test failed."),
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) => doDisconnect({ data: { connectionId } }),
    onSuccess: () => {
      toast.success("Account disconnected.");
      setConfirmDisconnect(null);
      void queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      void router.invalidate();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Disconnect failed."),
  });

  const connectedKeys = new Set(connections.map((c) => c.platform));
  // Keep every platform connectable so an expiring account can be re-authorized
  // and a second account on the same platform can be added.
  const available = platforms.map((p) => ({
    ...p,
    alreadyConnected: connectedKeys.has(p.key as SocialPlatform),
  }));
  const notConnectedCount = available.filter((p) => !p.alreadyConnected).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Social accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLoading
            ? "Loading your connections…"
            : `${connections.length} connected · ${notConnectedCount} available to connect`}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          PostFlow never asks for your social-media password. Accounts are connected using the
          platform's official authorization process, and tokens are encrypted before storage.
        </p>
      </div>

      {connectionsError && (
        <section className="rounded-2xl border border-destructive/50 p-4 text-sm" role="alert">
          <h2 className="font-semibold">Social accounts could not be loaded</h2>
          <p className="mt-1 text-muted-foreground">
            {clientErrorMessage(
              connectionsError,
              "The account service is temporarily unavailable. Please try again shortly.",
            )}
          </p>
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["social-connections"] })}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            Try again
          </button>
        </section>
      )}

      <SnapchatPublicProfileCard />

      {instagramStatus && !instagramStatus.configured ? (
        <div className="space-y-3 rounded-2xl border border-border p-4 text-sm">
          <p className="font-semibold">Instagram setup required</p>
          <p className="text-muted-foreground">
            {instagramStatus.message ??
              "Instagram has not been configured. Add the Instagram credentials in backend secrets."}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Create a Meta app with <strong>Instagram API with Instagram Login</strong> and add the
              scopes: {instagramStatus.scopes.join(", ")}.
            </li>
            <li>
              Register this exact redirect URI:{" "}
              <code className="break-all rounded bg-secondary px-1 py-0.5">
                {instagramStatus.callbackUrl}
              </code>
            </li>
            <li>
              Save <code>INSTAGRAM_OAUTH_CLIENT_ID</code>,{" "}
              <code>INSTAGRAM_OAUTH_CLIENT_SECRET</code> and <code>POSTFLOW_APP_URL</code> in
              backend secrets.
            </li>
            <li>
              Only Instagram <strong>Business</strong> or <strong>Creator</strong> accounts can be
              connected; publishing needs Meta tester access or app review.
            </li>
          </ul>
        </div>
      ) : null}

      {callbackError && (
        <section className="rounded-2xl border-2 border-primary p-5 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold">
                {(ERROR_SCREENS[callbackError.code] ?? ERROR_SCREENS["unknown"]!).title}
                {callbackError.platform ? ` · ${platformMap[callbackError.platform]?.name}` : ""}
              </h2>
              <p className="mt-1">{callbackError.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {(ERROR_SCREENS[callbackError.code] ?? ERROR_SCREENS["unknown"]!).hint}
              </p>
              {callbackError.platform === "snapchat" && (
                <SnapchatPortalHelp
                  redirectUri={
                    preflight?.platform === "snapchat" ? preflight.result.redirectUri : undefined
                  }
                  clientIdPrefix={
                    preflight?.platform === "snapchat" ? preflight.result.clientIdPrefix : null
                  }
                />
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                {callbackError.platform && (
                  <>
                    <button
                      onClick={() => connect(callbackError.platform as SocialPlatform)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-primary-foreground"
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      Retry connection
                    </button>
                    <button
                      disabled={preflightBusy === callbackError.platform}
                      onClick={() => runPreflight(callbackError.platform as SocialPlatform)}
                      className="rounded-md border border-primary/60 px-3 py-2 disabled:opacity-60"
                    >
                      {preflightBusy === callbackError.platform
                        ? "Checking…"
                        : "Run pre-flight check"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setCallbackError(null)}
                  className="rounded-md border border-dashed border-primary/60 px-3 py-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {preflight && (
        <section className="rounded-2xl border border-border p-5 text-sm">
          <div className="flex items-start gap-3">
            {preflight.result.ok ? (
              <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <X className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">
                Redirect URI pre-flight · {platformMap[preflight.platform]?.name}
              </h2>
              <p className="mt-1">{preflight.result.detail}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                This exact value must be registered in the developer dashboard (no trailing slash):
              </p>
              <code className="mt-1 block break-all rounded-md border border-border px-2 py-1.5 text-xs">
                {preflight.result.redirectUri}
              </code>
              {preflight.platform === "snapchat" && (
                <SnapchatPortalHelp clientIdPrefix={preflight.result.clientIdPrefix} />
              )}
              <div className="mt-3 flex gap-2 text-xs font-semibold">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(preflight.result.redirectUri);
                    toast.success("Redirect URI copied.");
                  }}
                  className="rounded-md border border-primary/60 px-3 py-2"
                >
                  Copy redirect URI
                </button>
                <button
                  onClick={() => setPreflight(null)}
                  className="rounded-md border border-dashed border-primary/60 px-3 py-2"
                >
                  Hide
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {showSnapchatHelp && (
        <section className="rounded-2xl border border-primary/50 p-5 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold">Snapchat did not complete authorization</h2>
              <p className="mt-1 text-muted-foreground">
                Snapchat showed "Failed to load authorization data" on its own consent page, so it
                never returned to PostFlow. That error comes from the Snap Developer portal
                configuration — PostFlow's credentials are accepted by Snapchat's token endpoint.
              </p>
              <SnapchatPortalHelp
                redirectUri={
                  preflight?.platform === "snapchat" ? preflight.result.redirectUri : undefined
                }
                clientIdPrefix={
                  preflight?.platform === "snapchat" ? preflight.result.clientIdPrefix : null
                }
              />
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  disabled={preflightBusy === "snapchat"}
                  onClick={() => runPreflight("snapchat")}
                  className="rounded-md border border-primary/60 px-3 py-2 disabled:opacity-60"
                >
                  {preflightBusy === "snapchat" ? "Checking…" : "Show exact redirect URI"}
                </button>
                <button
                  onClick={() => connect("snapchat")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-primary-foreground"
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Try again
                </button>
                <button
                  onClick={() => setShowSnapchatHelp(false)}
                  className="rounded-md border border-dashed border-primary/60 px-3 py-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {blocked && (
        <div className="rounded-2xl border border-dashed border-primary/60 p-4 text-sm">
          <p className="font-semibold">
            Continue connecting {platformMap[blocked.platform]?.name ?? blocked.platform}
          </p>
          <p className="mt-1 text-muted-foreground">
            Authorization must open in a full browser tab — the embedded preview cannot host the
            provider's login page.
          </p>
          <a
            href={blocked.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Open authorization in a new tab
          </a>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Connected</h2>
        {!isLoading && connections.length === 0 && (
          <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
            No accounts linked yet. Pick a platform below to authorize PostFlow.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((acc) => {
            const platform = platformMap[acc.platform];
            const busy =
              (refreshMutation.isPending && refreshMutation.variables === acc.id) ||
              (testMutation.isPending && testMutation.variables === acc.id) ||
              (disconnectMutation.isPending && disconnectMutation.variables === acc.id);
            const test = testResults[acc.id];
            const snapchatNeedsReconnect =
              acc.platform === "snapchat" && (acc.status !== "connected" || test?.ok === false);
            return (
              <article key={acc.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-center gap-3">
                  {acc.avatarUrl ? (
                    <img
                      src={acc.avatarUrl}
                      alt={`${acc.accountName} profile picture`}
                      width={44}
                      height={44}
                      loading="lazy"
                      className="size-11 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <platform.icon className="size-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{acc.accountName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {platform.name}
                      {acc.username ? ` · ${acc.username}` : ""}
                    </p>
                  </div>
                </div>

                <span
                  className={cn(
                    "mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                    acc.status === "connected" && "bg-primary text-primary-foreground",
                    acc.status === "expiring" && "hatch border border-primary/50",
                    acc.status === "expired" && "border border-dashed border-primary/60",
                  )}
                >
                  {statusLabel[acc.status]}
                </span>

                <dl className="mt-4 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Connected on</dt>
                    <dd className="font-medium">{formatDate(acc.connectedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Account ID</dt>
                    <dd
                      className="max-w-[55%] truncate font-mono font-medium"
                      title={acc.accountId}
                    >
                      {acc.accountId}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Token expiry</dt>
                    <dd className="font-medium">{formatDate(acc.tokenExpiresAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last sync</dt>
                    <dd className="font-medium">
                      {new Date(acc.lastSyncAt).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Permissions</dt>
                    <dd className="text-right font-medium">{acc.scopes.length} granted</dd>
                  </div>
                </dl>

                {acc.platform === "facebook" && <FacebookPagePicker connectionId={acc.id} />}

                {test && (
                  <p
                    className={cn(
                      "mt-3 rounded-md px-2.5 py-2 text-xs",
                      test.ok
                        ? "bg-primary text-primary-foreground"
                        : "border border-dashed border-primary/60",
                    )}
                  >
                    {test.ok ? "Verified" : "Failed"} at {test.at} — {test.message}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
                  {snapchatNeedsReconnect ? (
                    <button
                      disabled={busy || pending === "snapchat"}
                      onClick={() => connect("snapchat")}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60"
                    >
                      <RefreshCw
                        className={cn("size-3.5", pending === "snapchat" && "animate-spin")}
                        aria-hidden
                      />
                      {pending === "snapchat" ? "Redirecting…" : "Reconnect Snapchat"}
                    </button>
                  ) : acc.canRefresh ? (
                    <button
                      disabled={busy}
                      onClick={() => refreshMutation.mutate(acc.id)}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60"
                    >
                      <RefreshCw
                        className={cn(
                          "size-3.5",
                          refreshMutation.isPending &&
                            refreshMutation.variables === acc.id &&
                            "animate-spin",
                        )}
                        aria-hidden
                      />
                      Refresh token
                    </button>
                  ) : (
                    <button
                      disabled={busy || pending === acc.platform}
                      onClick={() => connect(acc.platform)}
                      className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60"
                    >
                      Reconnect
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => testMutation.mutate(acc.id)}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-primary/60 px-3 py-2 disabled:opacity-60"
                  >
                    <PlugZap
                      className={cn(
                        "size-3.5",
                        testMutation.isPending &&
                          testMutation.variables === acc.id &&
                          "animate-pulse",
                      )}
                      aria-hidden
                    />
                    Test connection
                  </button>
                  {acc.canRefresh && !snapchatNeedsReconnect && (
                    <button
                      disabled={busy || pending === acc.platform}
                      onClick={() => connect(acc.platform)}
                      className="rounded-md border border-primary/60 px-3 py-2 disabled:opacity-60"
                    >
                      Re-authenticate
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => setConfirmDisconnect(acc)}
                    className="rounded-md border border-dashed border-primary/60 px-3 py-2 hover:bg-accent disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {confirmDisconnect && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm disconnect"
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 text-sm">
            <h2 className="text-base font-bold">Disconnect {confirmDisconnect.accountName}?</h2>
            <p className="mt-2 text-muted-foreground">
              Scheduled posts targeting this {platformMap[confirmDisconnect.platform]?.name} account
              will stop publishing. Stored tokens are deleted immediately; you can reconnect at any
              time.
            </p>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Account ID</dt>
                <dd className="truncate font-mono">{confirmDisconnect.accountId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Connected on</dt>
                <dd>{formatDate(confirmDisconnect.connectedAt)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2 text-xs font-semibold">
              <button
                disabled={disconnectMutation.isPending}
                onClick={() => disconnectMutation.mutate(confirmDisconnect.id)}
                className="flex-1 rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60"
              >
                {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
              </button>
              <button
                onClick={() => setConfirmDisconnect(null)}
                className="flex-1 rounded-md border border-primary/60 px-3 py-2"
              >
                Keep connected
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Connect a platform</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {available.map((p) => (
            <article key={p.key} className="surface-strong rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <p.icon className="size-6" aria-hidden />
                <p className="text-sm font-semibold">{p.name}</p>
              </div>
              <p className="mt-3 text-xs opacity-85">{p.supports}</p>
              <p className="mt-1 text-xs opacity-85">Formats: {p.formats}</p>
              <button
                disabled={pending === p.key}
                onClick={() => connect(p.key as SocialPlatform)}
                className="mt-4 w-full rounded-md bg-primary-foreground px-3 py-2 text-xs font-semibold text-primary disabled:opacity-60"
              >
                {pending === p.key
                  ? "Redirecting…"
                  : p.alreadyConnected
                    ? `Connect another ${p.name} account`
                    : `Connect ${p.name}`}
              </button>

              <button
                disabled={preflightBusy === p.key}
                onClick={() => runPreflight(p.key as SocialPlatform)}
                className="mt-2 w-full rounded-md border border-primary-foreground/60 px-3 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {preflightBusy === p.key ? "Checking…" : "Check redirect URI"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
