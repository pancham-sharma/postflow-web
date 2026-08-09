import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startGoogleSignIn, rememberNext, takeNext } from "@/lib/auth-next";
import { verifyAuthenticatedSessionWithFallback } from "@/lib/auth-session";
import { normalizeEmail } from "@/lib/auth-policy";
import { authUserMessage, logAuthFailure } from "@/lib/supabase-auth-errors";



function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export const Route = createFileRoute("/login")({
  // Browser-only: the whole page depends on the auth session in localStorage.
  // Disabling SSR at the route level avoids rendering different fallback and
  // client trees, which can leave the preview blank after hydration.
  ssr: false,
  // `next` is optional so plain <Link to="/login"> stays valid everywhere.
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s['next']);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Log in — PostFlow" },
      { name: "description", content: "Log in to PostFlow to publish and schedule content across your connected social accounts." },
      { property: "og:title", content: "Log in — PostFlow" },
      { property: "og:description", content: "Access your PostFlow publishing workspace." },
    ],
  }),
  component: LoginPage,
});

const input =
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40";

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleAuthPending, setGoogleAuthPending] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  // Ref, not state: a second click in the same tick must be rejected before
  // React has re-rendered with the disabled button.
  const googleLock = useRef(false);
  const forwarding = useRef(false);

  // A browser session alone is not authorization. Ask the backend to validate
  // the bearer token and confirm the profile/workspace records exist; only a
  // verified result may leave the login page.
  const forwardIfVerified = useCallback(
    async (opts?: { announce?: boolean }): Promise<"ok" | "busy" | "failed"> => {
      // Another forward attempt already owns this sign-in (e.g. the
      // onAuthStateChange listener fired first). Report "busy" so the caller
      // never shows a failure toast for a sign-in that is actually succeeding.
      if (forwarding.current) return "busy";
      forwarding.current = true;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          forwarding.current = false;
          return "failed";
        }
        const verification = await verifyAuthenticatedSessionWithFallback();
        if (!verification?.ok) {
          console.error("[auth] session could not be verified server-side", verification);
          if (opts?.announce) {
            toast.error("We could not finish setting up your account. Please try signing in again.");
          }
          forwarding.current = false;
          setGoogleAuthPending(false);
          setGoogleFailed(true);
          googleLock.current = false;
          return "failed";
        }
        setGoogleFailed(false);
        const target = takeNext() ?? next ?? "/app";
        if (target === "/app") navigate({ to: "/app" });
        else window.location.replace(target);
        return "ok";
      } catch (e) {
        console.error("[auth] verification failed", e);
        forwarding.current = false;
        setGoogleAuthPending(false);
        googleLock.current = false;
        return "failed";
      }
    },
    [navigate, next],
  );


  // After a full-page Google round-trip the browser lands back on /login with a
  // session already set — verify it, then forward to the dashboard.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void forwardIfVerified({ announce: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void forwardIfVerified({ announce: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [forwardIfVerified]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || googleAuthPending) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) {
      logAuthFailure("password_sign_in", error);
      setBusy(false);
      toast.error(authUserMessage(error, "login"));
      return;
    }
    const result = await forwardIfVerified({ announce: true });
    setBusy(false);
    if (result === "failed") {
      toast.error("We could not verify your session. Please try signing in again.");
    }
  }

  /** True when Supabase already holds a session — a sign-in that really worked. */
  async function hasLiveSession() {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  }

  async function reportGoogleFailure() {
    // Never contradict reality: if the session landed, let the forward finish
    // instead of telling the user the sign-in failed.
    if (await hasLiveSession()) {
      void forwardIfVerified();
      return;
    }
    setGoogleFailed(true);
    toast.error("Google sign-in was not completed. Please try again.");
  }

  async function onGoogle() {
    // One OAuth attempt at a time: the lock rejects double-clicks synchronously.
    if (googleLock.current || googleAuthPending || busy) return;
    googleLock.current = true;
    setGoogleAuthPending(true);
    try {
      // Keep the intended destination out of redirect_uri: it must be a public
      // same-origin URL, so we come back to /login and forward from there.
      setGoogleFailed(false);
      rememberNext(next ?? null);
      // The provider returns to the public /auth/callback status page, which
      // verifies the session server-side before anyone reaches /app.
      const result = await startGoogleSignIn(next ?? null);
      if (result.error) {
        // Cancelled consent, closed popup and provider errors all land here.
        console.error("[auth] google sign-in failed", result.error);
        await reportGoogleFailure();
        return;
      }
      // Full-page redirect in flight: keep the button locked until unload.
      if (result.redirected) return;
      const outcome = await forwardIfVerified({ announce: true });
      // "busy" means the auth listener is already forwarding this same session.
      if (outcome === "failed") await reportGoogleFailure();
    } catch (e) {
      console.error("[auth] google sign-in threw", e);
      await reportGoogleFailure();
    } finally {
      if (!forwarding.current) {
        setGoogleAuthPending(false);
        googleLock.current = false;
      }
    }
  }





  return (
    <div className="mesh-vanilla flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-background p-8 shadow-lift">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            PF
          </span>
          <span className="text-lg font-semibold">PostFlow</span>
        </Link>
        <h1 className="mt-7 text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Log in to your publishing workspace.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              className={input}
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              className={input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || googleAuthPending}
            className="block w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <button
          type="button"
          onClick={onGoogle}
          disabled={googleAuthPending || busy}
          aria-busy={googleAuthPending}
          className="mt-3 w-full rounded-md border border-primary/60 px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleAuthPending ? "Connecting to Google…" : "Continue with Google"}
        </button>

        {googleFailed && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-dashed border-primary/60 p-4 text-sm"
          >
            <p className="font-semibold">Google sign-in was not completed.</p>
            <p className="mt-1 text-muted-foreground">
              Approve the Google permission screen to finish. Retry restarts the flow and keeps you
              headed to {next ?? "/app"}.
            </p>
            <button
              type="button"
              onClick={() => void onGoogle()}
              disabled={googleAuthPending}
              className="mt-3 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Retry Google sign-in
            </button>
          </div>
        )}


        <p className="mt-6 text-sm text-muted-foreground">
          No account yet?{" "}
          <Link to="/register" className="font-semibold text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
