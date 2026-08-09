import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SnapchatDestination } from "@/lib/snapchat-media-validation";

export type SnapchatPublicProfileStatus = {
  configured: boolean;
  connected: boolean;
  apiAvailable: boolean;
  connectionStatus: "connected" | "reconnect_required" | "api_unavailable" | "disconnected" | null;
  publicProfileId: string | null;
  publicProfileName: string | null;
  profiles: { id: string; name: string }[];
  destinations: SnapchatDestination[];
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  tokenValid: boolean;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
};

/** Read-only status for the Accounts page, composer and debug page. */
export const getSnapchatPublicProfileStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SnapchatPublicProfileStatus> => {
    const service = await import("@/lib/snapchat-public-profile.server");
    const configured = service.checkConfiguration().configured;
    const connection = await service.getConnection(context.userId);
    if (!connection) {
      return {
        configured,
        connected: false,
        apiAvailable: false,
        connectionStatus: null,
        publicProfileId: null,
        publicProfileName: null,
        profiles: [],
        destinations: [],
        grantedScopes: [],
        tokenExpiresAt: null,
        tokenValid: false,
        lastVerifiedAt: null,
        lastErrorCode: null,
      };
    }
    return {
      configured,
      connected: true,
      apiAvailable: connection.apiAvailable,
      connectionStatus: connection.connectionStatus,
      publicProfileId: connection.publicProfileId,
      publicProfileName: connection.publicProfileName,
      profiles: connection.availableProfiles,
      destinations: ((connection.capabilities["destinations"] as SnapchatDestination[]) ?? []).filter(
        Boolean,
      ),
      grantedScopes: connection.grantedScopes,
      tokenExpiresAt: connection.tokenExpiresAt,
      tokenValid: connection.tokenExpiresAt
        ? new Date(connection.tokenExpiresAt).getTime() > Date.now()
        : true,
      lastVerifiedAt: connection.lastVerifiedAt,
      lastErrorCode: connection.lastErrorCode,
    };
  });

/** Builds the Snapchat Business OAuth URL server-side (PKCE + one-time state). */
export const startSnapchatPublicProfileAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ origin: z.string().url().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ authorizeUrl: string }> => {
    const { randomBytes, createHash } = await import("node:crypto");
    const service = await import("@/lib/snapchat-public-profile.server");
    const { createOAuthState, resolveWorkspaceId } = await import(
      "@/lib/social-connections.server"
    );
    const config = service.checkConfiguration();
    if (!config.configured) {
      throw new Error("Automatic Snapchat publishing is not configured on the server.");
    }

    const origin = (() => {
      if (!data.origin) return null;
      try {
        const candidate = new URL(data.origin);
        const allowed =
          candidate.hostname === "localhost" ||
          candidate.hostname.endsWith(".lovable.app") ||
          candidate.hostname.endsWith(".lovableproject.com");
        return allowed ? candidate.origin : null;
      } catch {
        return null;
      }
    })();

    const redirect = service.redirectUri(origin);
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const workspaceId = await resolveWorkspaceId(context.userId);

    await createOAuthState({
      userId: context.userId,
      workspaceId,
      platform: "snapchat",
      state,
      codeVerifier,
      returnPath: "/app/accounts?snapchat_pp=1",
      returnOrigin: origin,
      existingAccountId: null,
    });

    const url = new URL(service.SNAPCHAT_PP_AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: (process.env["SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID"] ?? "").trim(),
      redirect_uri: redirect,
      response_type: "code",
      scope: service.SNAPCHAT_PP_SCOPES.join(" "),
      state,
      code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();

    console.info("[SNAP_PP_OAUTH_START]", { user_id: context.userId, redirect_uri: redirect });
    return { authorizeUrl: url.toString() };
  });

/** Runs a live capability check against Snapchat. Never fakes availability. */
export const verifySnapchatPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const service = await import("@/lib/snapchat-public-profile.server");
    return service.verifyCapability(context.userId);
  });

export const selectSnapchatPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ profileId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const service = await import("@/lib/snapchat-public-profile.server");
    await service.selectProfile(context.userId, data.profileId);
    return { ok: true };
  });

export const disconnectSnapchatPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const service = await import("@/lib/snapchat-public-profile.server");
    await service.disconnect(context.userId);
    return { ok: true };
  });
