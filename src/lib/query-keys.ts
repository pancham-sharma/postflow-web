/** Centralised TanStack Query keys so invalidation stays targeted. */
export const dashboardKeys = {
  summary: () => ["dashboard-summary"] as const,
  legacy: () => ["dashboard"] as const,
};

export const storageKeys = {
  usage: () => ["dashboard-summary"] as const,
};

export const accountKeys = {
  list: () => ["social-connections"] as const,
};

export const mediaKeys = {
  library: () => ["media-library"] as const,
};

export const postKeys = {
  history: () => ["post-history"] as const,
  calendar: () => ["post-calendar"] as const,
};
