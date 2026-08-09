// Music library API: browse licensed tracks, register user-owned audio with the
// licence evidence, and (admin) curate the shared PostFlow library.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import { LICENCE_TYPES, MUSIC_SOURCES, type MusicTrack } from "@/lib/music";

const trackInput = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200).default(""),
  source: z.enum(MUSIC_SOURCES),
  audioPath: z.string().max(500).nullable().optional(),
  audioUrl: z.string().url().max(2000).nullable().optional(),
  coverUrl: z.string().url().max(2000).nullable().optional(),
  genre: z.string().max(80).default(""),
  mood: z.string().max(80).default(""),
  durationSeconds: z.number().nonnegative().max(60 * 60).default(0),
  licenceType: z.enum(LICENCE_TYPES),
  licenceName: z.string().max(200).default(""),
  commercialUse: z.boolean().default(false),
  monetizationAllowed: z.boolean().default(false),
  attributionRequired: z.boolean().default(false),
  attributionText: z.string().max(1000).default(""),
  allowedPlatforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(10).default([]),
  licenceUrl: z.string().url().max(2000).nullable().optional(),
  licenceProofPath: z.string().max(500).nullable().optional(),
  licenceAcquiredAt: z.string().max(20).nullable().optional(),
  licenceExpiresAt: z.string().max(20).nullable().optional(),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  originalFilename: z.string().max(300).nullable().optional(),
  fileHash: z.string().max(200).nullable().optional(),
  /** Required for user uploads: proof the user asserted their rights. */
  ownershipConfirmed: z.boolean().default(false),
});

type Row = {
  id: string;
  workspace_id: string | null;
  source: string;
  title: string;
  artist: string;
  audio_path: string | null;
  audio_url: string | null;
  cover_url: string | null;
  genre: string;
  mood: string;
  duration_seconds: number | string;
  licence_type: string;
  licence_name: string;
  commercial_use: boolean;
  monetization_allowed: boolean;
  attribution_required: boolean;
  attribution_text: string;
  allowed_platforms: string[];
  licence_url: string | null;
  licence_proof_path: string | null;
  licence_acquired_at: string | null;
  licence_expires_at: string | null;
  status: string;
  ownership_confirmed_at: string | null;
  original_filename: string | null;
  file_hash: string | null;
};

function toTrack(row: Row, playbackUrl: string | null): MusicTrack {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    source: row.source as MusicTrack["source"],
    title: row.title,
    artist: row.artist,
    audioUrl: playbackUrl ?? row.audio_url,
    audioPath: row.audio_path,
    coverUrl: row.cover_url,
    genre: row.genre,
    mood: row.mood,
    durationSeconds: Number(row.duration_seconds) || 0,
    licenceType: row.licence_type as MusicTrack["licenceType"],
    licenceName: row.licence_name,
    commercialUse: row.commercial_use,
    monetizationAllowed: row.monetization_allowed,
    attributionRequired: row.attribution_required,
    attributionText: row.attribution_text,
    allowedPlatforms: (row.allowed_platforms ?? []).filter((p): p is MusicTrack["allowedPlatforms"][number] =>
      (SOCIAL_PLATFORMS as readonly string[]).includes(p),
    ),
    licenceUrl: row.licence_url,
    licenceProofPath: row.licence_proof_path,
    licenceAcquiredAt: row.licence_acquired_at,
    licenceExpiresAt: row.licence_expires_at,
    status: (row.status as MusicTrack["status"]) ?? "active",
    ownershipConfirmedAt: row.ownership_confirmed_at,
    originalFilename: row.original_filename,
    fileHash: row.file_hash,
  };
}

const SELECT =
  "id, workspace_id, source, title, artist, audio_path, audio_url, cover_url, genre, mood, duration_seconds, licence_type, licence_name, commercial_use, monetization_allowed, attribution_required, attribution_text, allowed_platforms, licence_url, licence_proof_path, licence_acquired_at, licence_expires_at, status, ownership_confirmed_at, original_filename, file_hash";

/** Every track the signed-in user may legally use: shared library + own workspace. */
export const listMusicTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MusicTrack[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("music_tracks")
      .select(SELECT)
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Row[];
    const signed = await Promise.all(
      rows.map(async (row) => {
        if (!row.audio_path) return null;
        const { data: url } = await supabaseAdmin.storage
          .from("music")
          .createSignedUrl(row.audio_path, 60 * 60 * 6);
        return url?.signedUrl ?? null;
      }),
    );
    return rows.map((row, i) => toTrack(row, signed[i] ?? null));
  });

/**
 * Registers audio the user uploaded or recorded. The ownership confirmation,
 * its timestamp, the user id, the original filename and the file hash are all
 * stored as evidence — uploading is not proof of ownership.
 */
export const registerUserTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => trackInput.parse(data))
  .handler(async ({ data, context }): Promise<MusicTrack> => {
    if (!data.ownershipConfirmed) {
      throw new Error("Confirm that you own this audio or have permission to use it.");
    }
    if (data.licenceType === "unknown") {
      throw new Error("Pick the licence that covers this audio — unknown licences cannot be published.");
    }
    if (data.allowedPlatforms.length === 0) {
      throw new Error("Select at least one platform this audio is licensed for.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);

    const { data: row, error } = await supabaseAdmin
      .from("music_tracks")
      .insert({
        workspace_id: workspaceId,
        uploaded_by: context.userId,
        source: data.source,
        title: data.title,
        artist: data.artist,
        audio_path: data.audioPath ?? null,
        audio_url: data.audioUrl ?? null,
        cover_url: data.coverUrl ?? null,
        genre: data.genre,
        mood: data.mood,
        duration_seconds: data.durationSeconds,
        licence_type: data.licenceType,
        licence_name: data.licenceName,
        commercial_use: data.commercialUse,
        monetization_allowed: data.monetizationAllowed,
        attribution_required: data.attributionRequired,
        attribution_text: data.attributionText,
        allowed_platforms: data.allowedPlatforms,
        licence_url: data.licenceUrl ?? null,
        licence_proof_path: data.licenceProofPath ?? null,
        licence_acquired_at: data.licenceAcquiredAt || null,
        licence_expires_at: data.licenceExpiresAt || null,
        status: "active",
        original_filename: data.originalFilename ?? null,
        file_hash: data.fileHash ?? null,
        ownership_confirmed_at: new Date().toISOString(),
        usage_rights: {
          commercialUse: data.commercialUse,
          monetization: data.monetizationAllowed,
          platforms: data.allowedPlatforms,
          confirmedBy: context.userId,
        } as never,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    let playback: string | null = null;
    const inserted = row as unknown as Row;
    if (inserted.audio_path) {
      const { data: url } = await supabaseAdmin.storage
        .from("music")
        .createSignedUrl(inserted.audio_path, 60 * 60 * 6);
      playback = url?.signedUrl ?? null;
    }
    return toTrack(inserted, playback);
  });

export const deleteMusicTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveWorkspaceId } = await import("@/lib/social-connections.server");
    const workspaceId = await resolveWorkspaceId(context.userId);

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    const query = supabaseAdmin.from("music_tracks").delete().eq("id", data.id);
    const { error } = isAdmin ? await query : await query.eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin curation of the shared, workspace-independent library. */
export const upsertLibraryTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    trackInput.extend({ id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MusicTrack> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can curate the shared music library.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      workspace_id: null,
      uploaded_by: context.userId,
      source: data.source,
      title: data.title,
      artist: data.artist,
      audio_path: data.audioPath ?? null,
      audio_url: data.audioUrl ?? null,
      cover_url: data.coverUrl ?? null,
      genre: data.genre,
      mood: data.mood,
      duration_seconds: data.durationSeconds,
      licence_type: data.licenceType,
      licence_name: data.licenceName,
      commercial_use: data.commercialUse,
      monetization_allowed: data.monetizationAllowed,
      attribution_required: data.attributionRequired,
      attribution_text: data.attributionText,
      allowed_platforms: data.allowedPlatforms,
      licence_url: data.licenceUrl ?? null,
      licence_proof_path: data.licenceProofPath ?? null,
      licence_acquired_at: data.licenceAcquiredAt || null,
      licence_expires_at: data.licenceExpiresAt || null,
      status: data.status,
      original_filename: data.originalFilename ?? null,
      file_hash: data.fileHash ?? null,
    };

    const builder = data.id
      ? supabaseAdmin.from("music_tracks").update(payload).eq("id", data.id)
      : supabaseAdmin.from("music_tracks").insert(payload);
    const { data: row, error } = await builder.select(SELECT).single();
    if (error) throw new Error(error.message);
    return toTrack(row as unknown as Row, null);
  });