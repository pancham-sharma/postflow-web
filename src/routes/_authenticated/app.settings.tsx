import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteMyAccount,
  exportMyData,
  getUserSettings,
  updatePreferences,
  updateProfile,
  type UserSettings,
} from "@/lib/settings.functions";
import { getMediaLibrary, clearUnusedMedia } from "@/lib/media.functions";
import { formatBytes } from "@/lib/media-library";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — PostFlow" },
      { name: "description", content: "Manage your account, security, posting defaults, notification preferences and storage in PostFlow." },
      { property: "og:title", content: "Settings — PostFlow" },
      { property: "og:description", content: "Account, security, posting defaults, notifications, storage and account deletion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const tabs = [
  "Account",
  "Security",
  "Posting defaults",
  "Notifications",
  "Storage",
  "Delete account",
] as const;
const input =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          "h-6 w-11 shrink-0 rounded-full border border-primary/50 p-0.5 transition-colors",
          on ? "bg-primary" : "bg-transparent",
        )}
      >
        <span
          className={cn(
            "block size-4.5 rounded-full transition-transform",
            on ? "translate-x-5 bg-primary-foreground" : "bg-primary/60",
          )}
        />
      </button>
    </div>
  );
}

type Prefs = UserSettings["preferences"];

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getUserSettings);
  const saveProfile = useServerFn(updateProfile);
  const savePrefs = useServerFn(updatePreferences);
  const exportData = useServerFn(exportMyData);
  const deleteAccount = useServerFn(deleteMyAccount);
  const fetchMedia = useServerFn(getMediaLibrary);
  const clearUnused = useServerFn(clearUnusedMedia);

  const [tab, setTab] = useState<(typeof tabs)[number]>("Account");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings({}) });
  const media = useQuery({
    queryKey: ["media-library"],
    queryFn: () => fetchMedia({}),
    enabled: tab === "Storage",
  });

  useEffect(() => {
    if (settings.data && !prefs) setPrefs(settings.data.preferences);
  }, [settings.data, prefs]);

  const profileMutation = useMutation({
    mutationFn: async (vars: { displayName: string; workspaceName: string }) =>
      saveProfile({ data: vars }),
    onSuccess: () => {
      toast.success("Profile saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prefsMutation = useMutation({
    mutationFn: async (vars: Partial<Prefs>) => savePrefs({ data: vars }),
    onSuccess: () => toast.success("Preferences saved."),
    onError: (e: Error) => toast.error(e.message),
  });

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    prefsMutation.mutate({ [key]: value } as Partial<Prefs>);
  }

  async function changePassword(current: string, next: string) {
    const email = settings.data?.email;
    if (!email) {
      toast.error("Missing account email.");
      return;
    }
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      toast.error("Your current password is incorrect.");
      return;
    }
    const update = await supabase.auth.updateUser({ password: next });
    if (update.error) {
      toast.error(update.error.message);
      return;
    }
    toast.success("Password updated.");
  }

  if (settings.isPending || !prefs) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border p-8 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your settings…
      </div>
    );
  }
  if (settings.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/60 p-6 text-center">
        <p className="font-semibold">Could not load your settings.</p>
        <button
          type="button"
          onClick={() => void settings.refetch()}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  const storage = media.data?.storage;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              tab === t ? "bg-primary text-primary-foreground" : "border border-primary/40 hover:bg-accent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-2xl rounded-2xl border border-border p-6">
        {tab === "Account" && (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              profileMutation.mutate({
                displayName: String(form.get("displayName") ?? "").trim(),
                workspaceName: String(form.get("workspaceName") ?? "").trim(),
              });
            }}
          >
            <Row label="Full name">
              <input name="displayName" className={input} defaultValue={settings.data.displayName} required maxLength={120} />
            </Row>
            <Row label="Email">
              <input className={input} value={settings.data.email ?? ""} readOnly aria-readonly />
            </Row>
            <Row label="Workspace name">
              <input name="workspaceName" className={input} defaultValue={settings.data.workspaceName} maxLength={120} />
            </Row>
            <Row label="Time zone">
              <select
                className={input}
                value={prefs.timezone}
                onChange={(e) => setPref("timezone", e.target.value)}
              >
                {[prefs.timezone, "UTC", "Europe/Berlin", "Europe/London", "America/New_York", "Asia/Kolkata"]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
              </select>
            </Row>
            <Row label="Language">
              <select className={input} value={prefs.language} onChange={(e) => setPref("language", e.target.value)}>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </Row>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {profileMutation.isPending ? "Saving…" : "Save account"}
              </button>
            </div>
          </form>
        )}

        {tab === "Security" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const current = String(form.get("current") ?? "");
              const next = String(form.get("next") ?? "");
              if (next.length < 8) {
                toast.error("Use at least 8 characters.");
                return;
              }
              void changePassword(current, next);
              e.currentTarget.reset();
            }}
          >
            <Row label="Current password"><input name="current" type="password" className={input} required /></Row>
            <Row label="New password"><input name="next" type="password" className={input} required minLength={8} /></Row>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Update password
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut({ scope: "global" });
                toast.success("Signed out on all devices.");
                void navigate({ to: "/login" });
              }}
              className="ml-2 rounded-md border border-dashed border-primary/60 px-4 py-2 text-sm font-semibold hover:bg-accent"
            >
              Log out from all devices
            </button>
          </form>
        )}

        {tab === "Posting defaults" && (
          <div className="space-y-4">
            <Row label="Default caption template">
              <textarea
                className={cn(input, "min-h-24")}
                value={prefs.defaultCaption}
                onChange={(e) => setPrefs((p) => (p ? { ...p, defaultCaption: e.target.value } : p))}
                onBlur={(e) => prefsMutation.mutate({ defaultCaption: e.target.value })}
                maxLength={2200}
              />
            </Row>
            <Row label="Default hashtags">
              <input
                className={input}
                value={prefs.defaultHashtags}
                onChange={(e) => setPrefs((p) => (p ? { ...p, defaultHashtags: e.target.value } : p))}
                onBlur={(e) => prefsMutation.mutate({ defaultHashtags: e.target.value })}
                maxLength={600}
              />
            </Row>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Default posting time">
                <input
                  type="time"
                  className={input}
                  value={prefs.defaultPostTime}
                  onChange={(e) => setPref("defaultPostTime", e.target.value)}
                />
              </Row>
              <Row label="Default YouTube visibility">
                <select
                  className={input}
                  value={prefs.defaultYoutubeVisibility}
                  onChange={(e) => setPref("defaultYoutubeVisibility", e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </Row>
            </div>
            <p className="text-xs text-muted-foreground">
              New posts start from these defaults. Changes save automatically.
            </p>
          </div>
        )}

        {tab === "Notifications" && (
          <div>
            <Toggle label="Post published" on={prefs.notifyPublished} onChange={(v) => setPref("notifyPublished", v)} />
            <Toggle label="Post partially published" on={prefs.notifyPartial} onChange={(v) => setPref("notifyPartial", v)} />
            <Toggle label="Post failed" on={prefs.notifyFailed} onChange={(v) => setPref("notifyFailed", v)} />
            <Toggle
              label="Schedule approaching"
              on={prefs.notifyScheduleApproaching}
              onChange={(v) => setPref("notifyScheduleApproaching", v)}
            />
            <Toggle
              label="Connected account expiring"
              on={prefs.notifyAccountExpiring}
              onChange={(v) => setPref("notifyAccountExpiring", v)}
            />
            <Toggle
              label="Storage limit reached"
              on={prefs.notifyStorageLimit}
              onChange={(v) => setPref("notifyStorageLimit", v)}
            />
            <Toggle label="Email notifications" on={prefs.notifyEmail} onChange={(v) => setPref("notifyEmail", v)} />
          </div>
        )}




        {tab === "Storage" && (
          <div className="space-y-4">
            {media.isPending ? (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading storage usage…
              </div>
            ) : storage ? (
              <>
                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>{formatBytes(storage.usedBytes)} used</span>
                    <span className="text-muted-foreground">{formatBytes(storage.limitBytes)} limit</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  {[...(media.data?.assets ?? [])]
                    .filter((a) => !a.deletedAt)
                    .sort((a, b) => b.fileSize - a.fileSize)
                    .slice(0, 5)
                    .map((a) => (
                      <li key={a.id} className="flex justify-between gap-3 border-b border-border pb-2">
                        <span className="truncate">{a.fileName}</span>
                        <span className="text-muted-foreground">{formatBytes(a.fileSize)}</span>
                      </li>
                    ))}
                </ul>
                <button
                  type="button"
                  onClick={async () => {
                    const preview = await clearUnused({ data: { apply: false } });
                    if (preview.items.length === 0) {
                      toast.success("No unused media found.");
                      return;
                    }
                    if (
                      window.confirm(
                        `Move ${preview.items.length} unused file(s) to Trash and reclaim ${formatBytes(preview.reclaimedBytes)}?`,
                      )
                    ) {
                      await clearUnused({ data: { apply: true } });
                      toast.success("Unused media moved to Trash.");
                      void queryClient.invalidateQueries({ queryKey: ["media-library"] });
                    }
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Clear unused media
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Storage usage is unavailable right now.</p>
            )}
          </div>
        )}

        {tab === "Delete account" && (
          <div className="space-y-4">
            <div className="hatch rounded-xl border border-primary/50 p-4 text-sm">
              Deleting your account removes all posts, media, schedules and connected accounts. Provider
              tokens are revoked immediately and this cannot be undone.
            </div>
            <Row label='Type DELETE to confirm'>
              <input
                className={input}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </Row>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const data = await exportData({});
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "postflow-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-md border border-primary/60 px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                Export my data
              </button>
              <button
                type="button"
                disabled={confirmText !== "DELETE"}
                onClick={async () => {
                  if (!window.confirm("Permanently delete your PostFlow account?")) return;
                  try {
                    await deleteAccount({ data: { confirm: "DELETE" } });
                    await supabase.auth.signOut();
                    toast.success("Your account has been deleted.");
                    void navigate({ to: "/" });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not delete the account.");
                  }
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Delete account permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
