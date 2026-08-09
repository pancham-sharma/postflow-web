import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Users, ListX, SlidersHorizontal, ScrollText, Gauge, Activity, KeyRound, Music } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { claimFirstAdmin, getMyRoles } from "@/lib/admin.functions";
import type { AppRole } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin console — PostFlow" },
      {
        name: "description",
        content:
          "Role-based admin console for PostFlow: user management, failed publish jobs, platform integration controls and audit logs.",
      },
      { property: "og:title", content: "Admin console — PostFlow" },
      {
        property: "og:description",
        content: "Manage users, inspect failed jobs, toggle platform publishing and read audit logs.",
      },
    ],
  }),
  component: AdminLayout,
});

const tabs = [
  { to: "/app/admin", label: "Overview", icon: Gauge, exact: true, minRole: "support" },
  { to: "/app/admin/users", label: "Users", icon: Users, exact: false, minRole: "support" },
  { to: "/app/admin/jobs", label: "Failed jobs", icon: ListX, exact: false, minRole: "support" },
  { to: "/app/admin/platforms", label: "Integrations", icon: SlidersHorizontal, exact: false, minRole: "admin" },
  { to: "/app/admin/music", label: "Music library", icon: Music, exact: false, minRole: "admin" },
  { to: "/app/admin/health", label: "Health", icon: Activity, exact: false, minRole: "support" },
  { to: "/app/admin/keys", label: "API keys", icon: KeyRound, exact: false, minRole: "admin" },
  { to: "/app/admin/logs", label: "API & logs", icon: ScrollText, exact: false, minRole: "admin" },
] as const;

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchRoles = useServerFn(getMyRoles);
  const claim = useServerFn(claimFirstAdmin);
  const [claiming, setClaiming] = useState(false);

  const { data: roles, isLoading, refetch } = useQuery<AppRole[]>({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });

  const isAdmin = roles?.includes("admin") ?? false;
  const isSupport = roles?.includes("support") ?? false;

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Checking your permissions…</p>;
  }

  if (!isAdmin && !isSupport) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border p-6 text-center">
        <ShieldAlert className="mx-auto size-8" aria-hidden />
        <h1 className="text-xl font-bold">Administrator access required</h1>
        <p className="text-sm text-muted-foreground">
          Your account does not hold an admin or support role. Roles are stored server-side and can
          only be granted by an existing administrator.
        </p>
        <button
          disabled={claiming}
          onClick={async () => {
            setClaiming(true);
            try {
              await claim();
              toast.success("You are now an administrator.");
              await refetch();
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not claim administrator access.",
              );
            } finally {
              setClaiming(false);
            }
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {claiming ? "Checking…" : "Claim first-administrator access"}
        </button>
        <p className="text-xs text-muted-foreground">
          This only works while the workspace has no administrator yet.
        </p>
      </div>
    );
  }

  const visible = tabs.filter((t) => (t.minRole === "admin" ? isAdmin : true));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Admin console</h1>
          {roles?.map((r) => (
            <span
              key={r}
              className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
            >
              {r}
            </span>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Full access: users, jobs, integrations and audit logs."
            : "Support access: read-only view of users and publish jobs."}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label="Admin sections">
        {visible.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-accent",
              )}
            >
              <tab.icon className="size-4" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
