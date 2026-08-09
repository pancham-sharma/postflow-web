// Client-safe metadata shared by the UI and the server OAuth layer.
export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "pinterest",
  "youtube",
  "snapchat",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}


export type ConnectionStatus = "connected" | "expiring" | "expired";

export type SocialConnection = {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  accountName: string;
  username: string | null;
  avatarUrl: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastSyncAt: string;
  /** When the account was first authorized. */
  connectedAt: string;
  status: ConnectionStatus;
  canRefresh: boolean;
};

export function connectionStatus(
  tokenExpiresAt: string | null,
): ConnectionStatus {
  if (!tokenExpiresAt) return "connected";
  const ms = new Date(tokenExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms < 7 * 24 * 60 * 60 * 1000) return "expiring";
  return "connected";
}
