import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  GENERIC_SIGNUP_ERROR,
  MIN_PASSWORD_LENGTH,
  isDisposableEmail,
  normalizeEmail,
  passwordProblem,
} from "@/lib/auth-policy";


export const Route = createFileRoute("/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create your account — PostFlow" },
      { name: "description", content: "Create a free PostFlow account and publish one upload across every connected social platform." },
      { property: "og:title", content: "Create your account — PostFlow" },
      { property: "og:description", content: "Start free: 2 connected accounts and 10 posts per month." },
    ],
  }),
  component: RegisterPage,
});

const input =
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40";

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) {
      toast.error("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    const cleanEmail = normalizeEmail(email);
    if (isDisposableEmail(cleanEmail)) {
      toast.error("Please use a permanent email address.");
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      toast.error(problem);
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim().slice(0, 80) },
      },
    });
    setBusy(false);
    if (error) {
      // Generic on purpose: never confirm whether an address is already registered.
      console.error("[auth] sign-up failed", error.message);
      toast.error(GENERIC_SIGNUP_ERROR);
      return;
    }
    if (data.session) {
      navigate({ to: "/app" });
      return;
    }
    setSent(true);
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

        {sent ? (
          <>
            <h1 className="mt-7 text-2xl font-bold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to {email}. Confirm it, then log in to connect your social
              accounts.
            </p>
            <Link
              to="/login"
              className="mt-6 block rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-soft"
            >
              Go to log in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-7 text-2xl font-bold">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Free plan: 2 connected accounts and 10 posts per month.
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Full name
                </span>
                <input
                  className={input}
                  placeholder="Amara Okafor"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </label>
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
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  {MIN_PASSWORD_LENGTH}+ characters. Mix cases, numbers or symbols, or use a
                  long passphrase.
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  required
                />
                <span className="text-muted-foreground">
                  I agree to the{" "}
                  <Link to="/" className="font-semibold text-foreground underline underline-offset-4">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/" className="font-semibold text-foreground underline underline-offset-4">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="block w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="mt-4 text-xs text-muted-foreground">
              We send a verification email before you can connect social accounts. PostFlow never asks
              for your social-media passwords.
            </p>
          </>
        )}

        <p className="mt-6 text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
