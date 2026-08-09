export type AppRole = "admin" | "support" | "member";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AdminOverview {
  totalUsers: number;
  failedJobs: number;
  queuedJobs: number;
  runningJobs: number;
  jobsLast24h: number;
  successRate: number | null;
  platformsDisabled: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isSuspended: boolean;
  createdAt: string;
  roles: AppRole[];
}

export interface PublishJob {
  id: string;
  user_id: string;
  platform: string;
  post_title: string;
  status: JobStatus;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  provider_response: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  next_retry_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformControl {
  platform: string;
  publishing_enabled: boolean;
  maintenance_mode: boolean;
  rate_limit_per_hour: number;
  notice: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

export const JOB_STATUSES: JobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as string[]).includes(value);
}

// ---------------- scoped admin API keys ----------------

export const API_KEY_SCOPES = [
  "jobs:read",
  "jobs:retry",
  "users:read",
  "users:write",
  "platforms:read",
  "platforms:write",
  "logs:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

export interface AdminApiKey {
  id: string;
  label: string;
  description: string | null;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  rotated_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  request_count: number;
}

// ---------------- job timeline / attempts ----------------

export interface JobAttempt {
  id: string;
  attempt_number: number;
  status: JobStatus;
  request_payload: string | null;
  provider_response: string | null;
  error_code: string | null;
  error_message: string | null;
  backoff_seconds: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface JobEvent {
  id: string;
  attempt_number: number | null;
  kind: string;
  message: string;
  detail: string | null;
  actor_email: string | null;
  occurred_at: string;
}

export interface JobDetail {
  job: PublishJob;
  attempts: JobAttempt[];
  events: JobEvent[];
}

// ---------------- platform health ----------------

export type SyncStatus = "healthy" | "degraded" | "failing" | "unknown";

export interface PlatformHealth {
  platform: string;
  sync_status: SyncStatus;
  last_webhook_at: string | null;
  last_poll_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  failure_alert_threshold: number;
  stale_sync_alert_minutes: number;
  permission_expiry_alert_days: number;
  alert_message: string | null;
  checked_at: string;
  updated_at: string;
  /** Derived server-side, not stored. */
  alerts: string[];
  connectedAccounts: number;
  expiringAccounts: number;
  expiredAccounts: number;
  failedJobs24h: number;
}
