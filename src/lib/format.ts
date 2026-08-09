/** Single shared byte formatter used by the sidebar, dashboard and settings. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function storagePercent(usedBytes: number, limitBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0) return 0;
  return Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));
}
