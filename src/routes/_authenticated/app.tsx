import { Link, Outlet, useRouterState, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PlusCircle,
  Images,
  CalendarDays,
  Link2,
  History,
  Settings,
  Bell,
  Menu,
  LogOut,
  ShieldCheck,
  User,
  Globe,
  Clock,
  Building2,
  Wand2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { withAuthRecovery } from "@/lib/unauthorized";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/admin.functions";
import type { AppRole } from "@/lib/admin-types";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { listNotifications } from "@/lib/notifications.functions";
import { getDashboardSummary } from "@/lib/dashboard-summary.functions";
import { getUserSettings } from "@/lib/settings.functions";
import { storageKeys } from "@/lib/query-keys";
import { formatBytes, storagePercent } from "@/lib/format";
import { clearAllComposerDrafts } from "@/lib/composer-draft";
import { useJobRealtime } from "@/hooks/use-job-realtime";


export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/create", label: "Create Post", icon: PlusCircle },
  { to: "/app/generator", label: "AI Title Generator", icon: Wand2 },
  { to: "/app/media", label: "Media Library", icon: Images },
  { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/app/posts", label: "Post History", icon: History },
  { to: "/app/accounts", label: "Social Accounts", icon: Link2 },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

const adminItem = { to: "/app/admin", label: "Admin Console", icon: ShieldCheck } as const;

const NotificationBell = memo(function NotificationBell() {
  const fetchNotifications = useServerFn(listNotifications);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => withAuthRecovery(() => fetchNotifications(), { items: [], unread: 0 }),
    refetchInterval: 120_000,
  });
  const unread = data?.unread ?? 0;
  return (
    <Link
      to="/app/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative grid size-11 place-items-center rounded-md border border-border"
    >
      <Bell className="size-4.5" aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
});

const NavList = memo(function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchRoles = useServerFn(getMyRoles);
  // The verified role is fetched once and cached — never re-checked per nav item.
  const { data: roles } = useQuery<AppRole[]>({
    queryKey: ["my-roles"],
    queryFn: () => withAuthRecovery(() => fetchRoles(), [] as AppRole[]),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  const showAdmin = roles?.includes("admin") || roles?.includes("support");
  const items = useMemo(
    () => (showAdmin ? [...nav, adminItem] : nav),
    [showAdmin],
  );
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.to === "/app/admin" ? pathname.startsWith(item.to) : pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent",
            )}
          >
            <item.icon className="size-4.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
});

/**
 * Mobile navigation owns its own open/closed state so toggling it never
 * re-renders the routed page content below.
 */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-md border border-border lg:hidden"
      >
        <Menu className="size-4.5" aria-hidden />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-border bg-sidebar p-4 lg:hidden">
          <NavList onNavigate={close} />
        </div>
      )}
    </>
  );
}
/** Real workspace storage usage — shared query with the dashboard, never demo values. */
const SidebarPlanCard = memo(function SidebarPlanCard() {
  const fetchSummary = useServerFn(getDashboardSummary);
  const { data } = useQuery({
    queryKey: storageKeys.usage(),
    queryFn: () => withAuthRecovery(() => fetchSummary(), null),
    staleTime: 15_000,
  });
  const used = data?.storageUsedBytes ?? 0;
  const limit = data?.storageLimitBytes ?? 10 * 1024 ** 3;
  const percent = storagePercent(used, limit);
  return (
    <div className="mt-auto shrink-0 rounded-xl border border-sidebar-border p-4 text-sidebar-foreground">
      <p className="text-sm font-semibold">Creator plan</p>
      <p className="mt-1 text-xs opacity-80">
        {formatBytes(used)} of {formatBytes(limit)} storage used
      </p>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-sidebar-primary/25"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {percent > 0 && (
          <div
            className="h-full rounded-full bg-sidebar-primary"
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        )}
      </div>
      <p className="mt-2 text-xs opacity-80">{percent < 1 && used > 0 ? "<1" : Math.round(percent)}%</p>
    </div>
  );
});

/** Header profile menu: real profile, workspace, timezone and language + sign out. */
const ProfileMenu = memo(function ProfileMenu({
  onSignOut,
  signingOut,
}: {
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fetchSettings = useServerFn(getUserSettings);
  const { data } = useQuery({
    queryKey: ["user-settings", "profile-menu"],
    queryFn: () => withAuthRecovery(() => fetchSettings(), null),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = data?.displayName?.trim() || data?.email?.split("@")[0] || "Your account";
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "PF";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-11 place-items-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-bold text-primary"
      >
        {data?.avatarUrl ? (
          <img src={data.avatarUrl} alt="" className="size-full object-cover" />
        ) : data ? (
          initials
        ) : (
          <User className="size-4.5" aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-background shadow-soft"
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
              {data?.avatarUrl ? (
                <img src={data.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {data?.email ?? "Loading…"}
              </p>
            </div>
          </div>

          <dl className="space-y-2.5 p-4 text-xs">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="ml-auto truncate font-semibold">{data?.workspaceName ?? "—"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-primary" aria-hidden />
              <dt className="text-muted-foreground">Time zone</dt>
              <dd className="ml-auto truncate font-semibold">
                {data?.preferences.timezone ?? "—"}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-primary" aria-hidden />
              <dt className="text-muted-foreground">Language</dt>
              <dd className="ml-auto truncate font-semibold">
                {data?.preferences.language ?? "—"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1 border-t border-border p-2">
            <Link
              to="/app/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Settings className="size-4" aria-hidden />
              Account settings
            </Link>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-accent disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  // One layout-level subscription keeps every page and shared header/sidebar
  // counter current, including pages that are not themselves publishing views.
  useJobRealtime([
    ["notifications"],
    ["dashboard"],
    ["dashboard-summary"],
    ["post-history"],
    ["post-calendar"],
    ["calendar"],
    ["social-connections"],
    ["media-library"],
    ["destination-attempts"],
    ["admin-jobs"],
    ["admin-job-detail"],
    ["admin-overview"],
    ["platform-health"],
    ["platform-controls"],
  ]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    clearAllComposerDrafts();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }, [signingOut, queryClient, navigate]);


  return (
    <div className="flex min-h-dvh w-full bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 bg-sidebar p-5 lg:flex">
        <Link to="/app" className="flex shrink-0 items-center gap-2 text-sidebar-foreground">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            PF
          </span>
          <span className="text-lg font-semibold">PostFlow</span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto pt-3">
          <NavList />
        </div>
        <SidebarPlanCard />
      </aside>


      <div className="flex min-w-0 flex-1 flex-col">
        {/* Solid (not blurred) sticky header: a full-width backdrop-filter forces a
            repaint of the whole strip on every scroll frame. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Welcome back</p>
              <p className="truncate text-xs text-muted-foreground">
                Your publishing workspace
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
            <Link
              to="/app/create"
              className="hidden rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 sm:inline-flex"
            >
              Create post
            </Link>
            <ProfileMenu onSignOut={handleSignOut} signingOut={signingOut} />

          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
