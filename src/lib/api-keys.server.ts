import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Human-visible prefix so a key can be identified without revealing it. */
export const API_KEY_PREFIX = "pfsk";

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Returns the plaintext key (shown once) and the stored prefix + hash. */
export function mintApiKey(): { plaintext: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const shortId = randomBytes(4).toString("hex");
  const prefix = `${API_KEY_PREFIX}_${shortId}`;
  const plaintext = `${prefix}.${secret}`;
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/**
 * Verifies a presented key against admin_api_keys and records last-used
 * metadata. Returns the key row when valid, otherwise null.
 */
export async function verifyApiKey(
  presented: string,
  requiredScope: string,
  ip: string,
): Promise<{ id: string; label: string; scopes: string[] } | null> {
  const prefix = presented.split(".")[0];
  if (!prefix?.startsWith(`${API_KEY_PREFIX}_`)) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("admin_api_keys")
    .select("id, label, key_hash, scopes, revoked_at, expires_at, request_count")
    .eq("key_prefix", prefix)
    .maybeSingle();

  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  if (!safeEqualHex(hashApiKey(presented), row.key_hash)) return null;
  if (!row.scopes.includes(requiredScope)) return null;

  await supabaseAdmin
    .from("admin_api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: ip,
      request_count: (row.request_count ?? 0) + 1,
    })
    .eq("id", row.id);

  return { id: row.id, label: row.label, scopes: row.scopes };
}
