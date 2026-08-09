import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSocialPlatform } from "@/lib/social-platforms";
import { isApiKeyScope, isJobStatus } from "@/lib/admin-types";
import {
  assertRole,
  backoffSeconds,
  deriveHealth,
  toAuditLog,
  toJobAttempt,
  toJobEvent,
  toPublishJob,
  writeAudit,
} from "@/lib/admin-helpers";
import type {
  AdminApiKey,
  AdminAuditLog,
  AdminOverview,
  AdminUser,
  AppRole,
  JobDetail,
  PlatformControl,
  PlatformHealth,
  PublishJob,
} from "@/lib/admin-types";

/** Roles of the signed-in user — drives admin nav visibility. */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppRole[]> => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return (data ?? []).map((r: { role: AppRole }) => r.role);
  });

/**
 * One-time bootstrap: the very first account can claim the admin role, but only
 * while no administrator exists yet. Once one exists this always fails.
 */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) {
      throw new Error("An administrator already exists. Ask them to grant you access.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "admin.bootstrap",
      "user",
      context.userId,
      { note: "First administrator claimed" },
    );
    return { ok: true };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    const sb = context.supabase;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [users, jobsFailed, jobsQueued, jobs24h, connections, controls] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("publish_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      sb.from("publish_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
      sb.from("publish_jobs").select("status").gte("created_at", since),
      sb.from("publish_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
      sb.from("platform_controls").select("platform, publishing_enabled, maintenance_mode"),
    ]);

    const recent = (jobs24h.data ?? []) as { status: string }[];
    const succeeded = recent.filter((j) => j.status === "succeeded").length;
    const settled = recent.filter((j) => j.status === "succeeded" || j.status === "failed").length;

    return {
      totalUsers: users.count ?? 0,
      failedJobs: jobsFailed.count ?? 0,
      queuedJobs: jobsQueued.count ?? 0,
      runningJobs: connections.count ?? 0,
      jobsLast24h: recent.length,
      successRate: settled === 0 ? null : Math.round((succeeded / settled) * 100),
      platformsDisabled: (controls.data ?? []).filter(
        (c) => !c.publishing_enabled || c.maintenance_mode,
      ).length,
    };
  });

// ---------------- users ----------------

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, is_suspended, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const byUser = new Map<string, AppRole[]>();
    for (const row of (roles ?? []) as { user_id: string; role: AppRole }[]) {
      byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role]);
    }
    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      isSuspended: p.is_suspended,
      createdAt: p.created_at,
      roles: byUser.get(p.id) ?? [],
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRole; grant: boolean }) => {
    if (!["admin", "support", "member"].includes(input.role)) throw new Error("Unknown role");
    if (!input.userId) throw new Error("Missing user");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    if (data.userId === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot remove your own administrator role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      data.grant ? "role.grant" : "role.revoke",
      "user",
      data.userId,
      { role: data.role },
    );
    return { ok: true };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; suspended: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    if (data.userId === context.userId) throw new Error("You cannot suspend your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      data.suspended ? "user.suspend" : "user.restore",
      "user",
      data.userId,
      {},
    );
    return { ok: true };
  });

// ---------------- jobs ----------------

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { status?: string; platform?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<PublishJob[]> => {
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    // Explicit columns: the list view never renders provider_response /
    // request_payload, and those JSON blobs dominated the response size.
    const listColumns: string =
      "id,user_id,workspace_id,platform,post_title,status,attempt_count,max_attempts,error_code,error_message,scheduled_for,started_at,finished_at,duration_ms,next_retry_at,created_at,updated_at";
    let query = context.supabase
      .from("publish_jobs")
      .select(listColumns)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.status && isJobStatus(data.status)) query = query.eq("status", data.status);
    if (data.platform && data.platform !== "all") query = query.eq("platform", data.platform);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Record<string, unknown>[]).map(toPublishJob);
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error: readError } = await supabaseAdmin
      .from("publish_jobs")
      .select("id, status, attempt_count, max_attempts")
      .eq("id", data.jobId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!job) throw new Error("Job not found.");
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("Only failed or cancelled jobs can be requeued.");
    }
    const { error } = await supabaseAdmin
      .from("publish_jobs")
      .update({
        status: "queued",
        error_code: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        max_attempts: Math.max(job.max_attempts, job.attempt_count + 1),
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "job.retry",
      "publish_job",
      data.jobId,
      { previousStatus: job.status },
    );
    return { ok: true };
  });

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("publish_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .in("status", ["queued", "running", "failed"]);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "job.cancel",
      "publish_job",
      data.jobId,
      {},
    );
    return { ok: true };
  });

// ---------------- platform controls ----------------

export const listPlatformControls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformControl[]> => {
    const { data, error } = await context.supabase
      .from("platform_controls")
      .select("*")
      .order("platform");
    if (error) throw new Error(error.message);
    return (data ?? []) as PlatformControl[];
  });

export const updatePlatformControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      platform: string;
      publishingEnabled?: boolean;
      maintenanceMode?: boolean;
      rateLimitPerHour?: number;
      notice?: string | null;
    }) => {
      if (!isSocialPlatform(input.platform)) throw new Error("Unknown platform");
      if (
        input.rateLimitPerHour !== undefined &&
        (!Number.isInteger(input.rateLimitPerHour) ||
          input.rateLimitPerHour < 0 ||
          input.rateLimitPerHour > 10000)
      ) {
        throw new Error("Rate limit must be between 0 and 10000 posts per hour.");
      }
      if (input.notice != null && input.notice.length > 500) {
        throw new Error("Notice must be 500 characters or fewer.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const patch: {
      updated_by: string;
      publishing_enabled?: boolean;
      maintenance_mode?: boolean;
      rate_limit_per_hour?: number;
      notice?: string | null;
    } = { updated_by: context.userId };
    if (data.publishingEnabled !== undefined) patch.publishing_enabled = data.publishingEnabled;
    if (data.maintenanceMode !== undefined) patch.maintenance_mode = data.maintenanceMode;
    if (data.rateLimitPerHour !== undefined) patch.rate_limit_per_hour = data.rateLimitPerHour;
    if (data.notice !== undefined) patch.notice = data.notice?.trim() || null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_controls")
      .update(patch)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "platform.update",
      "platform",
      data.platform,
      patch,
    );
    return { ok: true };
  });

// ---------------- audit log ----------------

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAuditLog[]> => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { data, error } = await context.supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAuditLog);
  });

// ---------------- scoped API keys for support tools ----------------

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminApiKey[]> => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { data, error } = await context.supabase
      .from("admin_api_keys")
      .select(
        "id, label, description, key_prefix, scopes, created_at, expires_at, revoked_at, rotated_at, last_used_at, last_used_ip, request_count",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminApiKey[];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { label: string; description?: string; scopes: string[]; expiresInDays?: number }) => {
      const label = input.label.trim();
      if (label.length < 3 || label.length > 60) {
        throw new Error("Label must be between 3 and 60 characters.");
      }
      if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
        throw new Error("Select at least one scope.");
      }
      if (!input.scopes.every(isApiKeyScope)) throw new Error("Unknown scope requested.");
      if (
        input.expiresInDays !== undefined &&
        (!Number.isInteger(input.expiresInDays) ||
          input.expiresInDays < 1 ||
          input.expiresInDays > 365)
      ) {
        throw new Error("Expiry must be between 1 and 365 days.");
      }
      return { ...input, label, scopes: [...new Set(input.scopes)] };
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string; plaintext: string }> => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { mintApiKey } = await import("@/lib/api-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const minted = mintApiKey();
    const expiresAt =
      data.expiresInDays === undefined
        ? null
        : new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();

    const { data: row, error } = await supabaseAdmin
      .from("admin_api_keys")
      .insert({
        label: data.label,
        description: data.description?.trim() || null,
        key_prefix: minted.prefix,
        key_hash: minted.hash,
        scopes: data.scopes,
        created_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "apikey.create",
      "api_key",
      row.id,
      { label: data.label, scopes: data.scopes, expires_at: expiresAt },
    );
    return { id: row.id, plaintext: minted.plaintext };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keyId: string }) => input)
  .handler(async ({ data, context }): Promise<{ plaintext: string }> => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { mintApiKey } = await import("@/lib/api-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("admin_api_keys")
      .select("id, revoked_at")
      .eq("id", data.keyId)
      .maybeSingle();
    if (!existing) throw new Error("Key not found.");
    if (existing.revoked_at) throw new Error("A revoked key cannot be rotated.");

    const minted = mintApiKey();
    const { error } = await supabaseAdmin
      .from("admin_api_keys")
      .update({
        key_prefix: minted.prefix,
        key_hash: minted.hash,
        rotated_at: new Date().toISOString(),
        last_used_at: null,
        last_used_ip: null,
        request_count: 0,
      })
      .eq("id", data.keyId);
    if (error) throw new Error(error.message);

    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "apikey.rotate",
      "api_key",
      data.keyId,
      { new_prefix: minted.prefix },
    );
    return { plaintext: minted.plaintext };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keyId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_api_keys")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("id", data.keyId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "apikey.revoke",
      "api_key",
      data.keyId,
      {},
    );
    return { ok: true };
  });

// ---------------- job timeline + payload diffing ----------------

export const getJobDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }): Promise<JobDetail> => {
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    const [job, attempts, events] = await Promise.all([
      context.supabase.from("publish_jobs").select("*").eq("id", data.jobId).maybeSingle(),
      context.supabase
        .from("publish_job_attempts")
        .select("*")
        .eq("job_id", data.jobId)
        .order("attempt_number"),
      context.supabase
        .from("publish_job_events")
        .select("id, attempt_number, kind, message, detail, actor_email, occurred_at")
        .eq("job_id", data.jobId)
        .order("occurred_at"),
    ]);
    if (!job.data) throw new Error("Job not found.");
    return {
      job: toPublishJob(job.data),
      attempts: (attempts.data ?? []).map(toJobAttempt),
      events: (events.data ?? []).map(toJobEvent),
    };
  });

export const retryJobWithBackoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; delaySeconds?: number }) => {
    if (
      input.delaySeconds !== undefined &&
      (!Number.isInteger(input.delaySeconds) ||
        input.delaySeconds < 0 ||
        input.delaySeconds > 86_400)
    ) {
      throw new Error("Delay must be between 0 seconds and 24 hours.");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ nextRetryAt: string; delaySeconds: number }> => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("publish_jobs")
      .select("id, status, attempt_count, max_attempts, request_payload")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("Job not found.");
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("Only failed or cancelled jobs can be requeued.");
    }

    const delay = data.delaySeconds ?? backoffSeconds(job.attempt_count);
    const nextRetryAt = new Date(Date.now() + delay * 1000).toISOString();
    const nextAttempt = job.attempt_count + 1;
    const actorEmail = (context.claims as { email?: string } | null)?.email ?? null;

    const { error } = await supabaseAdmin
      .from("publish_jobs")
      .update({
        status: "queued",
        error_code: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        next_retry_at: nextRetryAt,
        max_attempts: Math.max(job.max_attempts, nextAttempt),
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("publish_job_attempts").insert({
      job_id: data.jobId,
      attempt_number: nextAttempt,
      status: "queued",
      request_payload: job.request_payload,
      backoff_seconds: delay,
    });

    await supabaseAdmin.from("publish_job_events").insert({
      job_id: data.jobId,
      attempt_number: nextAttempt,
      kind: "retried",
      message: `Requeued with ${delay}s backoff (attempt ${nextAttempt})`,
      detail: { backoff_seconds: delay, next_retry_at: nextRetryAt },
      actor_id: context.userId,
      actor_email: actorEmail,
    });

    await writeAudit(
      supabaseAdmin,
      context.userId,
      actorEmail,
      "job.retry_backoff",
      "publish_job",
      data.jobId,
      { delaySeconds: delay, nextRetryAt },
    );
    return { nextRetryAt, delaySeconds: delay };
  });

// ---------------- platform integration health ----------------

export const listPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformHealth[]> => {
    await assertRole(context.supabase as never, context.userId, ["admin", "support"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [health, connections, failed] = await Promise.all([
      supabaseAdmin.from("platform_health").select("*").order("platform"),
      supabaseAdmin.from("social_connections").select("platform, token_expires_at"),
      supabaseAdmin
        .from("publish_jobs")
        .select("platform")
        .eq("status", "failed")
        .gte("created_at", since),
    ]);

    const conns = (connections.data ?? []) as { platform: string; token_expires_at: string | null }[];
    const failures = (failed.data ?? []) as { platform: string }[];

    return (health.data ?? []).map((row) => {
      const platform = (row as { platform: string }).platform;
      const windowDays = (row as { permission_expiry_alert_days: number })
        .permission_expiry_alert_days;
      const cutoff = Date.now() + windowDays * 86_400_000;
      const mine = conns.filter((c) => c.platform === platform);
      const expired = mine.filter(
        (c) => c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now(),
      ).length;
      const expiring = mine.filter((c) => {
        if (!c.token_expires_at) return false;
        const t = new Date(c.token_expires_at).getTime();
        return t >= Date.now() && t <= cutoff;
      }).length;
      return deriveHealth(row as Record<string, unknown>, {
        connectedAccounts: mine.length,
        expiringAccounts: expiring,
        expiredAccounts: expired,
        failedJobs24h: failures.filter((f) => f.platform === platform).length,
      });
    });
  });

export const updatePlatformHealthThresholds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      platform: string;
      failureAlertThreshold?: number;
      staleSyncAlertMinutes?: number;
      permissionExpiryAlertDays?: number;
    }) => {
      if (!isSocialPlatform(input.platform)) throw new Error("Unknown platform");
      const bounds: [number | undefined, number, number, string][] = [
        [input.failureAlertThreshold, 1, 100, "Failure threshold must be 1-100."],
        [input.staleSyncAlertMinutes, 5, 10_080, "Stale sync window must be 5-10080 minutes."],
        [input.permissionExpiryAlertDays, 1, 90, "Permission expiry window must be 1-90 days."],
      ];
      for (const [value, min, max, message] of bounds) {
        if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
          throw new Error(message);
        }
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const patch: {
      updated_by: string;
      failure_alert_threshold?: number;
      stale_sync_alert_minutes?: number;
      permission_expiry_alert_days?: number;
    } = { updated_by: context.userId };
    if (data.failureAlertThreshold !== undefined) {
      patch.failure_alert_threshold = data.failureAlertThreshold;
    }
    if (data.staleSyncAlertMinutes !== undefined) {
      patch.stale_sync_alert_minutes = data.staleSyncAlertMinutes;
    }
    if (data.permissionExpiryAlertDays !== undefined) {
      patch.permission_expiry_alert_days = data.permissionExpiryAlertDays;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_health")
      .update(patch)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "platform.health_thresholds",
      "platform",
      data.platform,
      patch,
    );
    return { ok: true };
  });

/** Re-runs the connectivity probe for one platform and stores the result. */
export const runPlatformHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: string }) => {
    if (!isSocialPlatform(input.platform)) throw new Error("Unknown platform");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase as never, context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const { data: conns } = await supabaseAdmin
      .from("social_connections")
      .select("token_expires_at")
      .eq("platform", data.platform);
    const rows = (conns ?? []) as { token_expires_at: string | null }[];
    const expired = rows.filter(
      (c) => c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now(),
    ).length;

    const ok = rows.length > 0 && expired === 0;
    const { error } = await supabaseAdmin
      .from("platform_health")
      .update({
        checked_at: now,
        last_poll_at: now,
        sync_status: rows.length === 0 ? "unknown" : ok ? "healthy" : "failing",
        ...(ok ? { last_success_at: now } : { last_error_at: now }),
        last_error_message: ok
          ? null
          : rows.length === 0
            ? "No connected accounts for this platform."
            : `${expired} account permission(s) are expired and need reconnecting.`,
        consecutive_failures: ok ? 0 : expired,
        alert_message: ok ? null : "Probe failed — see error message.",
        updated_by: context.userId,
      })
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    await writeAudit(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      "platform.health_check",
      "platform",
      data.platform,
      { ok, connectedAccounts: rows.length, expired },
    );
    return { ok };
  });
