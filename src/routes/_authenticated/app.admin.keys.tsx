import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, RefreshCw, Ban, Plus } from "lucide-react";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "@/lib/admin.functions";
import { API_KEY_SCOPES, type AdminApiKey } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin/keys")({
  head: () => ({
    meta: [
      { title: "Admin API keys — PostFlow" },
      {
        name: "description",
        content:
          "Generate, rotate and revoke scoped API keys for PostFlow support tools, with last-used time and last-used IP for every key.",
      },
      { property: "og:title", content: "Admin API keys — PostFlow" },
      {
        property: "og:description",
        content: "Scoped support-tool keys with rotation, revocation and last-used visibility.",
      },
    ],
  }),
  component: AdminKeysPage,
});

function relative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function keyState(k: AdminApiKey): { label: string; tone: "live" | "warn" | "dead" } {
  if (k.revoked_at) return { label: "Revoked", tone: "dead" };
  if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) {
    return { label: "Expired", tone: "dead" };
  }
  if (!k.last_used_at) return { label: "Unused", tone: "warn" };
  return { label: "Active", tone: "live" };
}

function AdminKeysPage() {
  const queryClient = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const doCreate = useServerFn(createApiKey);
  const doRotate = useServerFn(rotateApiKey);
  const doRevoke = useServerFn(revokeApiKey);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<string[]>(["jobs:read"]);
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery<AdminApiKey[]>({
    queryKey: ["admin-api-keys"],
    queryFn: () => fetchKeys(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });

  const createMutation = useMutation({
    mutationFn: () =>
      doCreate({
        data: {
          label,
          description,
          scopes,
          ...(expiresInDays.trim() ? { expiresInDays: Number(expiresInDays) } : {}),
        },
      }),
    onSuccess: (result) => {
      setRevealed(result.plaintext);
      setShowForm(false);
      setLabel("");
      setDescription("");
      setScopes(["jobs:read"]);
      void invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not create the key."),
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => doRotate({ data: { keyId } }),
    onSuccess: (result) => {
      setRevealed(result.plaintext);
      toast.success("Key rotated — the previous secret no longer works.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Rotation failed."),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => doRevoke({ data: { keyId } }),
    onSuccess: () => {
      toast.success("Key revoked.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Revocation failed."),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Support tool API keys</h2>
          <p className="text-sm text-muted-foreground">
            Keys are stored hashed — the secret is shown once, at creation or rotation.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          New key
        </button>
      </div>

      {revealed && (
        <div className="surface-strong space-y-3 rounded-2xl p-5">
          <p className="text-sm font-bold">Copy this secret now — it is never shown again.</p>
          <code className="block break-all rounded-md border border-primary-foreground/40 p-3 text-xs">
            {revealed}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(revealed);
                toast.success("Key copied to clipboard.");
              }}
              className="inline-flex items-center gap-2 rounded-md border border-primary-foreground/50 px-3 py-1.5 text-xs font-semibold"
            >
              <Copy className="size-3.5" aria-hidden />
              Copy key
            </button>
            <button
              onClick={() => setRevealed(null)}
              className="rounded-md border border-primary-foreground/50 px-3 py-1.5 text-xs font-semibold"
            >
              I've stored it
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4 rounded-2xl border border-border p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Label
              <input
                required
                minLength={3}
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Tier-1 support console"
                className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Expires in (days, blank = never)
              <input
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold">
            Description
            <input
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this key is used for"
              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <fieldset>
            <legend className="text-xs font-semibold">Scopes</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {API_KEY_SCOPES.map((scope) => {
                const on = scopes.includes(scope);
                return (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setScopes((prev) =>
                        prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
                      )
                    }
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "border border-border hover:bg-accent",
                    )}
                  >
                    {scope}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={createMutation.isPending || scopes.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {createMutation.isPending ? "Generating…" : "Generate key"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading keys…</p>}

      {!isLoading && keys.length === 0 && (
        <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
          No API keys yet. Generate one to let a support tool call the scoped endpoints.
        </p>
      )}

      <ul className="space-y-3">
        {keys.map((k) => {
          const state = keyState(k);
          const busy =
            (rotateMutation.isPending && rotateMutation.variables === k.id) ||
            (revokeMutation.isPending && revokeMutation.variables === k.id);
          return (
            <li key={k.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <KeyRound className="size-4" aria-hidden />
                </span>
                <div className="min-w-52 flex-1">
                  <p className="text-sm font-semibold">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <code>{k.key_prefix}.••••••••</code>
                    {k.description ? ` · ${k.description}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {k.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-primary/50 px-2 py-0.5 text-xs font-semibold"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    state.tone === "live" && "bg-primary text-primary-foreground",
                    state.tone === "warn" && "hatch border border-primary/50",
                    state.tone === "dead" && "border border-dashed border-primary/60",
                  )}
                >
                  {state.label}
                </span>
                {!k.revoked_at && (
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => rotateMutation.mutate(k.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      Rotate
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => revokeMutation.mutate(k.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <Ban className="size-3.5" aria-hidden />
                      Revoke
                    </button>
                  </div>
                )}
              </div>

              <dl className="mt-3 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-muted-foreground">Last used</dt>
                  <dd className="font-semibold">{relative(k.last_used_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last used IP</dt>
                  <dd className="font-semibold">{k.last_used_ip ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Requests</dt>
                  <dd className="font-semibold tabular-nums">{k.request_count}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rotated</dt>
                  <dd className="font-semibold">{relative(k.rotated_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd className="font-semibold">
                    {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "never"}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <p className="rounded-2xl border border-border p-4 text-xs text-muted-foreground">
        Support tools authenticate by sending the key as{" "}
        <code>Authorization: Bearer &lt;key&gt;</code> to{" "}
        <code>/api/public/support/job-status?jobId=…</code>. Each accepted call records the time and
        the caller IP shown above.
      </p>
    </div>
  );
}
