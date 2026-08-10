/** Preserve the provider lifecycle; missing expiry is represented as null. */
export function tokenExpiryIso(expiresInSeconds: number | null | undefined): string | null {
  const providerTtl = Number(expiresInSeconds);
  if (!Number.isFinite(providerTtl) || providerTtl <= 0) return null;
  return new Date(Date.now() + providerTtl * 1000).toISOString();
}
