// Typed RPC for the Source Idea "Generate for All Platforms" action.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOURCE_IDEA_PLATFORMS, type SourcePlatformContent } from "@/lib/source-idea";

const sourceIdeaSchema = z.object({
  title: z.string().trim().min(3).max(300),
  language: z.string().trim().max(60).default("English"),
  tone: z.string().trim().max(60).default("Engaging"),
  target_audience: z.string().trim().max(160).default(""),
  location: z.string().trim().max(120).default(""),
});

export const sourceIdeaRequestSchema = sourceIdeaSchema.extend({
  platforms: z.array(z.enum(SOURCE_IDEA_PLATFORMS)).min(1).max(7),
});

const singleSchema = sourceIdeaSchema.extend({
  platform: z.enum(SOURCE_IDEA_PLATFORMS),
});

/** Best-effort per-user rate limit for AI generation. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

export function checkRateLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    throw new Error("Too many AI requests — wait a minute and try again.");
  }
  recent.push(now);
  hits.set(userId, recent);
}

/**
 * Generates one platform at a time so the composer can show per-platform
 * progress and keep going when a single platform fails.
 */
export const generateSourceIdeaForPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => singleSchema.parse(data))
  .handler(async ({ data, context }): Promise<SourcePlatformContent> => {
    checkRateLimit(context.userId);
    const { generatePlatformFromTitle } = await import("@/lib/source-idea.server");
    return generatePlatformFromTitle(
      {
        title: data.title,
        language: data.language,
        tone: data.tone,
        targetAudience: data.target_audience,
        location: data.location,
      },
      data.platform,
      context.userId,
    );
  });

/** Analyses the source title only (topic, category, intent, keywords). */
export const analyzeSourceIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sourceIdeaSchema.parse(data))
  .handler(async ({ data, context }) => {
    checkRateLimit(context.userId);
    const { analyzeSourceTitle } = await import("@/lib/source-idea.server");
    return analyzeSourceTitle(
      {
        title: data.title,
        language: data.language,
        tone: data.tone,
        targetAudience: data.target_audience,
        location: data.location,
      },
      context.userId,
    );
  });
