// Adapter registry. Server-only: each adapter handles real provider tokens.
import type { SocialPlatform } from "@/lib/social-platforms";
import type { PublishingProviderAdapter } from "./types";
import instagram from "./instagram.server";
import facebook from "./facebook.server";
import pinterest from "./pinterest.server";
import youtube from "./youtube.server";
import snapchat from "./snapchat.server";

export const adapters: Record<SocialPlatform, PublishingProviderAdapter> = {
  instagram,
  facebook,
  pinterest,
  youtube,
  snapchat,
};

export function adapterFor(platform: SocialPlatform): PublishingProviderAdapter {
  const adapter = adapters[platform];
  if (!adapter) throw new Error(`No publishing adapter for ${platform}`);
  return adapter;
}
