/** Preserve the provider lifecycle; missing expiry is represented as null. */
export function tokenExpiryIso(expiresInSeconds: number | null | undefined): string | null {
  let providerTtl = Number(expiresInSeconds);
  if (!Number.isFinite(providerTtl) || providerTtl <= 0) {
    // If the provider doesn't specify an expiry, default to 3 hours
    // to force reliable background refreshing.
    providerTtl = 3 * 60 * 60;
  }
  return new Date(Date.now() + providerTtl * 1000).toISOString();
}
