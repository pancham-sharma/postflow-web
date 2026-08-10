/** Provider tokens are treated as one-day PostFlow sessions. */
export const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export function tokenExpiryIso(expiresInSeconds: number | null | undefined): string {
  const providerTtl = Number(expiresInSeconds);
  const ttl = Number.isFinite(providerTtl) && providerTtl > 0
    ? Math.min(providerTtl, DEFAULT_TOKEN_TTL_SECONDS)
    : DEFAULT_TOKEN_TTL_SECONDS;
  return new Date(Date.now() + ttl * 1000).toISOString();
}
