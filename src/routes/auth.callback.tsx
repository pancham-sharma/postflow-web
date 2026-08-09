// Visible landing page for the Google round-trip. Nothing here trusts the
// browser session on its own: the server must confirm the bearer token and the
// profile/workspace records before we forward anyone into /app.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { verifyAuthenticatedSessionWithFallback } from "@/lib/auth-session";
import { peekNext, takeNext, startGoogleSignIn, clearNext } from "@/lib/auth-next";

export const Route = createFileRoute("/auth/callback")({
  // The Supabase session lives in localStorage, so this page is browser-only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Completing Google sign-in — PostFlow" },
      {
        name: "description",
        content: "Finishing your Google sign-in and verifying your PostFlow workspace.",
      },
      { property: "og:title", content: "Completing Google sign-in — PostFlow" },
      { property: "og:description", content: "Verifying your PostFlow session." },
    ],
  }),
  component: GoogleCallback,
});

type Phase = "waiting" | "verifying" | "verified" | "failed";

const REASONS: Record<string, string> = {
  no_session:
    "Google did not send a session back. This usually means the consent screen was closed or cancelled.",
  not_verified:
    "You signed in with Google, but we could not finish setting up your workspace. Retrying usually fixes it.",
  error: "Something interrupted the sign-in before it finished.",
};

function GoogleCallback() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [reason, setReason] = useState<string>("");
  const [retrying, setRetrying] = useState(false);
  const ran = useRef(false);
  const destination = peekNext() ?? "/app";

  const complete = useCallback(async () => {
    setPhase("waiting");
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      setPhase("failed");
      setReason(REASONS['no_session']!);
      return;
    }
    setPhase("verifying");
    const verification = await verifyAuthenticatedSessionWithFallback();
    if (!verification?.ok) {
      console.error("[auth] google callback could not be verified", verification);
      setPhase("failed");
      setReason(REASONS['not_verified']!);
      return;
    }
    setPhase("verified");
    const target = takeNext() ?? "/app";
    // Only a server-verified session may leave this page for the dashboard.
    if (target === "/app") navigate({ to: "/app", replace: true });
    else window.location.replace(target);
  }, [navigate]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void complete();
  }, [complete]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      // One click restarts the whole flow and keeps the intended destination.
      const result = await startGoogleSignIn(destination === "/app" ? null : destination);
      if (result.error) {
        setRetrying(false);
        setPhase("failed");
        setReason(REASONS['error']!);
      }
    } catch (e) {
      console.error("[auth] retry failed", e);
      setRetrying(false);
      setPhase("failed");
      setReason(REASONS['error']!);
    }
  }

  const busy = phase === "waiting" || phase === "verifying";

  return (
    <main className="mesh-vanilla grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-background p-8 shadow-lift">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          PF
        </span>

        {busy && (
          <>
            <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Completing Google sign-in…
            </h1>
            <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">
              {phase === "waiting"
                ? "Reading the session Google sent back. Keep this tab open — this normally takes a couple of seconds."
                : "Verifying your account and workspace on the server before opening your dashboard."}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              You will land on <span className="font-semibold">{destination}</span> as soon as the
              session is verified. If nothing happens after ~10 seconds, use the retry button below.
            </p>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="mt-6 w-full rounded-md border border-primary/60 px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-60"
            >
              {retrying ? "Restarting…" : "Retry Google sign-in"}
            </button>
          </>
        )}

        {phase === "verified" && (
          <>
            <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold">
              <ShieldCheck className="size-5" aria-hidden />
              Signed in
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">Opening your dashboard…</p>
          </>
        )}

        {phase === "failed" && (
          <>
            <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold">
              <TriangleAlert className="size-5" aria-hidden />
              Google sign-in was not completed
            </h1>
            <p className="mt-3 text-sm text-muted-foreground" role="alert">
              {reason}
            </p>
            <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>1. Click retry below — it restarts the flow and keeps you headed to {destination}.</li>
              <li>2. Choose your Google account and approve the permission screen.</li>
              <li>3. If a pop-up was blocked, allow pop-ups for this site and retry.</li>
            </ol>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {retrying ? "Restarting…" : "Retry Google sign-in"}
              </button>
              <Link
                to="/login"
                onClick={() => clearNext()}
                className="flex-1 rounded-md border border-border px-4 py-2.5 text-center text-sm font-semibold hover:bg-accent"
              >
                Back to log in
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
