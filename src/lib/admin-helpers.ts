import type {
  AdminAuditLog,
  AppRole,
  JobAttempt,
  JobEvent,
  PlatformHealth,
  PublishJob,
  SyncStatus,
} from "@/lib/admin-types";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function jsonToText(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value, null, 2);
}

export function toPublishJob(row: Record<string, unknown>): PublishJob {
  const { provider_response, request_payload, ...rest } = row as unknown as PublishJob & {
    provider_response: unknown;
    request_payload?: unknown;
  };
  void request_payload;
  return {
    ...(rest as Omit<PublishJob, "provider_response">),
    provider_response: jsonToText(provider_response),
  };
}

export function toJobAttempt(row: Record<string, unknown>): JobAttempt {
  const { provider_response, request_payload, ...rest } = row as unknown as JobAttempt & {
    provider_response: unknown;
    request_payload: unknown;
  };
  return {
    ...(rest as Omit<JobAttempt, "provider_response" | "request_payload">),
    provider_response: jsonToText(provider_response),
    request_payload: jsonToText(request_payload),
  };
}

export function toJobEvent(row: Record<string, unknown>): JobEvent {
  const { detail, ...rest } = row as unknown as JobEvent & { detail: unknown };
  return { ...(rest as Omit<JobEvent, "detail">), detail: jsonToText(detail) };
}

export function toAuditLog(row: Record<string, unknown>): AdminAuditLog {
  const { details, ...rest } = row as unknown as AdminAuditLog & { details: unknown };
  return { ...(rest as Omit<AdminAuditLog, "details">), details: jsonToText(details) };
}

/** Exponential backoff with a cap, used by "retry with backoff". */
export function backoffSeconds(attempt: number): number {
  return Math.min(2 ** Math.max(attempt, 0) * 30, 3600);
}

/** Server-side role check. Never trust a role claim coming from the browser. */
export async function assertRole(
  supabase: RpcClient,
  userId: string,
  roles: AppRole[],
): Promise<AppRole> {
  for (const role of roles) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
    if (data === true) return role;
  }
  throw new Error("Forbidden: this area requires an administrator role.");
}

type Inserter = {
  from: (table: string) => { insert: (row: Record<string, unknown>) => unknown };
};

export async function writeAudit(
  supabaseAdmin: unknown,
  actorId: string,
  actorEmail: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await (supabaseAdmin as Inserter).from("admin_audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

interface HealthInputs {
  connectedAccounts: number;
  expiringAccounts: number;
  expiredAccounts: number;
  failedJobs24h: number;
}

/** Derives the alert list and effective sync status from thresholds. */
export function deriveHealth(
  row: Record<string, unknown>,
  inputs: HealthInputs,
): PlatformHealth {
  const r = row as unknown as Omit<
    PlatformHealth,
    "alerts" | "connectedAccounts" | "expiringAccounts" | "expiredAccounts" | "failedJobs24h"
  >;
  const alerts: string[] = [];
  const now = Date.now();

  const lastSync = [r.last_webhook_at, r.last_poll_at]
    .filter(Boolean)
    .map((v) => new Date(v as string).getTime())
    .sort((a, b) => b - a)[0];

  if (lastSync === undefined) {
    alerts.push("No webhook or poll run has ever been recorded.");
  } else {
    const minutes = Math.round((now - lastSync) / 60000);
    if (minutes > r.stale_sync_alert_minutes) {
      alerts.push(
        `Last sync was ${minutes} min ago, over the ${r.stale_sync_alert_minutes} min threshold.`,
      );
    }
  }

  if (r.consecutive_failures >= r.failure_alert_threshold) {
    alerts.push(
      `${r.consecutive_failures} consecutive failures (threshold ${r.failure_alert_threshold}).`,
    );
  }
  if (inputs.expiredAccounts > 0) {
    alerts.push(`${inputs.expiredAccounts} account permission(s) have already expired.`);
  }
  if (inputs.expiringAccounts > 0) {
    alerts.push(
      `${inputs.expiringAccounts} account permission(s) expire within ${r.permission_expiry_alert_days} days.`,
    );
  }
  if (inputs.failedJobs24h > 0) {
    alerts.push(`${inputs.failedJobs24h} publish job(s) failed in the last 24h.`);
  }

  let status: SyncStatus = r.sync_status;
  if (inputs.expiredAccounts > 0 || r.consecutive_failures >= r.failure_alert_threshold) {
    status = "failing";
  } else if (alerts.length > 0 && status === "healthy") {
    status = "degraded";
  }

  return { ...r, sync_status: status, alerts, ...inputs };
}
