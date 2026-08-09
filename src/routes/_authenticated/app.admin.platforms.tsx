import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPlatformControls, updatePlatformControl } from "@/lib/admin.functions";
import type { PlatformControl } from "@/lib/admin-types";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin/platforms")({
  head: () => ({
    meta: [
      { title: "Platform integration controls — PostFlow admin" },
      {
        name: "description",
        content: "Enable or pause publishing per platform, set hourly rate limits and broadcast a maintenance notice to publishers.",
      },
      { property: "og:title", content: "Platform integration controls — PostFlow admin" },
      { property: "og:description", content: "Per-platform publishing switches, rate limits and notices." },
    ],
  }),
  component: AdminPlatformsPage,
});

function AdminPlatformsPage() {
  const queryClient = useQueryClient();
  const fetchControls = useServerFn(listPlatformControls);
  const doUpdate = useServerFn(updatePlatformControl);

  const { data: controls = [], isLoading } = useQuery<PlatformControl[]>({
    queryKey: ["platform-controls"],
    queryFn: () => fetchControls(),
  });

  const mutation = useMutation({
    mutationFn: (vars: {
      platform: string;
      publishingEnabled?: boolean;
      maintenanceMode?: boolean;
      rateLimitPerHour?: number;
      notice?: string | null;
    }) => doUpdate({ data: vars }),
    onSuccess: () => {
      toast.success("Integration updated.");
      void queryClient.invalidateQueries({ queryKey: ["platform-controls"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading integrations…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {controls.map((control) => (
        <PlatformCard
          key={control.platform}
          control={control}
          pending={mutation.isPending}
          onChange={(patch) => mutation.mutate({ platform: control.platform, ...patch })}
        />
      ))}
    </div>
  );
}

function PlatformCard({
  control,
  pending,
  onChange,
}: {
  control: PlatformControl;
  pending: boolean;
  onChange: (patch: {
    publishingEnabled?: boolean;
    maintenanceMode?: boolean;
    rateLimitPerHour?: number;
    notice?: string | null;
  }) => void;
}) {
  const meta = platformMap[control.platform as SocialPlatform];
  const [rate, setRate] = useState(String(control.rate_limit_per_hour));
  const [notice, setNotice] = useState(control.notice ?? "");

  useEffect(() => {
    setRate(String(control.rate_limit_per_hour));
    setNotice(control.notice ?? "");
  }, [control.rate_limit_per_hour, control.notice]);

  const dirty =
    rate !== String(control.rate_limit_per_hour) || notice !== (control.notice ?? "");

  return (
    <article className="space-y-4 rounded-2xl border border-border p-5">
      <header className="flex items-center gap-3">
        {meta && (
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <meta.icon className="size-5" aria-hidden />
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold">{meta?.name ?? control.platform}</h2>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(control.updated_at).toLocaleString()}
          </p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-1 text-xs font-semibold",
            control.maintenance_mode
              ? "hatch border border-primary/50"
              : control.publishing_enabled
                ? "bg-primary text-primary-foreground"
                : "border border-dashed border-primary/60",
          )}
        >
          {control.maintenance_mode
            ? "Maintenance"
            : control.publishing_enabled
              ? "Live"
              : "Disabled"}
        </span>
      </header>

      <div className="space-y-2">
        <Toggle
          label="Publishing enabled"
          hint="Turn off to block all new jobs for this platform."
          checked={control.publishing_enabled}
          disabled={pending}
          onToggle={(v) => onChange({ publishingEnabled: v })}
        />
        <Toggle
          label="Maintenance mode"
          hint="Keeps jobs queued instead of sending them to the provider."
          checked={control.maintenance_mode}
          disabled={pending}
          onToggle={(v) => onChange({ maintenanceMode: v })}
        />
      </div>

      <label className="block text-xs font-semibold">
        Rate limit (posts per hour)
        <input
          type="number"
          min={0}
          max={10000}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-semibold">
        Notice shown to publishers
        <textarea
          value={notice}
          rows={2}
          maxLength={500}
          onChange={(e) => setNotice(e.target.value)}
          placeholder="Optional message, e.g. why publishing is paused"
          className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <button
        disabled={pending || !dirty}
        onClick={() =>
          onChange({ rateLimitPerHour: Number(rate), notice: notice.trim() || null })
        }
        className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {dirty ? "Save changes" : "Saved"}
      </button>
    </article>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className={cn(
          "mt-0.5 h-6 w-11 shrink-0 rounded-full border border-primary/60 p-0.5 transition-colors disabled:opacity-60",
          checked ? "bg-primary" : "bg-transparent",
        )}
      >
        <span
          className={cn(
            "block size-4.5 rounded-full transition-transform",
            checked ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-primary",
          )}
        />
      </button>
    </div>
  );
}
