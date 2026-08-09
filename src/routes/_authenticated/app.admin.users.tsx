import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { getMyRoles, listUsers, setUserRole, setUserSuspended } from "@/lib/admin.functions";
import type { AdminUser, AppRole } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/admin/users")({
  head: () => ({
    meta: [
      { title: "User management — PostFlow admin" },
      {
        name: "description",
        content: "Search PostFlow accounts, grant or revoke admin and support roles, and suspend or restore access.",
      },
      { property: "og:title", content: "User management — PostFlow admin" },
      { property: "og:description", content: "Role-based user administration for PostFlow." },
    ],
  }),
  component: AdminUsersPage,
});

const assignable: AppRole[] = ["admin", "support", "member"];

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const fetchRoles = useServerFn(getMyRoles);
  const doSetRole = useServerFn(setUserRole);
  const doSuspend = useServerFn(setUserSuspended);
  const [term, setTerm] = useState("");

  const { data: myRoles } = useQuery<AppRole[]>({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  const canWrite = myRoles?.includes("admin") ?? false;

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole; grant: boolean }) =>
      doSetRole({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(`${vars.grant ? "Granted" : "Revoked"} ${vars.role}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["my-roles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Role update failed."),
  });

  const suspendMutation = useMutation({
    mutationFn: (vars: { userId: string; suspended: boolean }) => doSuspend({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.suspended ? "Account suspended." : "Account restored.");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed."),
  });

  const filtered = users.filter((u) => {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.displayName ?? "").toLowerCase().includes(q) ||
      u.roles.some((r) => r.includes(q))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          <span className="sr-only">Search users</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by email, name or role"
            className="w-full rounded-md border border-border bg-transparent py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${filtered.length} of ${users.length} accounts`}
        </p>
      </div>

      {!canWrite && (
        <p className="rounded-2xl border border-dashed border-primary/60 p-4 text-sm">
          You have support access — this list is read-only. Only administrators can change roles or
          suspend accounts.
        </p>
      )}

      {!isLoading && users.length === 0 && (
        <p className="rounded-2xl border border-dashed border-primary/60 p-5 text-sm text-muted-foreground">
          No accounts yet. Users appear here as soon as they register.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">PostFlow accounts and their roles</caption>
          <thead className="border-b border-border text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Account</th>
              <th scope="col" className="p-3 font-semibold">Roles</th>
              <th scope="col" className="p-3 font-semibold">Joined</th>
              <th scope="col" className="p-3 font-semibold">Status</th>
              {canWrite && <th scope="col" className="p-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border/60 last:border-0">
                <td className="p-3">
                  <p className="font-semibold">{u.displayName ?? "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">{u.email ?? u.id}</p>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          r === "admin"
                            ? "bg-primary text-primary-foreground"
                            : "border border-primary/50",
                        )}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      u.isSuspended
                        ? "border border-dashed border-primary/60"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {u.isSuspended ? "Suspended" : "Active"}
                  </span>
                </td>
                {canWrite && (
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {assignable.map((role) => {
                        const has = u.roles.includes(role);
                        return (
                          <button
                            key={role}
                            disabled={roleMutation.isPending}
                            onClick={() =>
                              roleMutation.mutate({ userId: u.id, role, grant: !has })
                            }
                            className={cn(
                              "rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-60",
                              has
                                ? "bg-primary text-primary-foreground"
                                : "border border-border hover:bg-accent",
                            )}
                          >
                            {has ? `− ${role}` : `+ ${role}`}
                          </button>
                        );
                      })}
                      <button
                        disabled={suspendMutation.isPending}
                        onClick={() =>
                          suspendMutation.mutate({ userId: u.id, suspended: !u.isSuspended })
                        }
                        className="rounded-md border border-dashed border-primary/60 px-2 py-1 text-xs font-semibold hover:bg-accent disabled:opacity-60"
                      >
                        {u.isSuspended ? "Restore" : "Suspend"}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
