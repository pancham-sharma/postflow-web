// AI assistance for the per-platform composer: rewrite one card, or generate a
// tailored variant for every selected platform from the same source idea.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

export type GeneratedCard = {
  platform: string;
  title: string;
  hook: string;
  caption: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  tags: string[];
  callToAction: string;
  altText: string;
  firstComment: string;
  pinnedComment: string;
  overlayText: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function normalize(raw: unknown): GeneratedCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (!str(c["platform"])) return null;
  return {
    platform: str(c["platform"]),
    title: str(c["title"]),
    hook: str(c["hook"]),
    caption: str(c["caption"]),
    description: str(c["description"]),
    hashtags: list(c["hashtags"]),
    keywords: list(c["keywords"]),
    tags: list(c["tags"]),
    callToAction: str(c["callToAction"]),
    altText: str(c["altText"]),
    firstComment: str(c["firstComment"]),
    pinnedComment: str(c["pinnedComment"]),
    overlayText: str(c["overlayText"]),
  };
}

/** Parses the model's JSON reply, tolerating code fences and surrounding prose. */
function parseCards(text: string | undefined): GeneratedCard[] {
  if (!text) return [];
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const candidates: string[] = [];
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) candidates.push(arrMatch[0]);
  candidates.push(cleaned);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const raw = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { cards?: unknown }).cards)
          ? ((parsed as { cards: unknown[] }).cards)
          : [];
      const cards = raw.map(normalize).filter((c): c is GeneratedCard => c !== null);
      if (cards.length > 0) return cards;
    } catch {
      // try the next candidate
    }
  }
  return [];
}

const input = z.object({
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1).max(10),
  idea: z.string().max(4000).default(""),
  tone: z.string().max(60).default("friendly and confident"),
  mediaType: z.enum(["image", "video", "none"]).default("none"),
});

const PLATFORM_BRIEF: Record<string, string> = {
  instagram:
    "Instagram: conversational caption up to 2200 chars, strong first line hook, 8-15 niche hashtags, an optional first comment with extra hashtags, short CTA.",
  facebook:
    "Facebook: slightly longer narrative post, plain language, few hashtags (max 3), optional headline title and link description.",
  pinterest:
    "Pinterest: SEO-driven. Title max 100 chars with the main keyword, description max 500 chars, 8-12 search keywords, max 5 hashtags.",
  youtube:
    "YouTube: title max 100 chars and clickable, description max 5000 chars with a hook line, timestamps-free summary, 10-20 tags, max 3 hashtags, a pinned comment.",
  snapchat:
    "Snapchat: very short punchy caption max 250 chars, optional 3-5 word overlay text, casual tone.",
};

/** Generates one independent content variant per selected platform. */
export const generatePlatformContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<GeneratedCard[]> => {
    const { generateAiText } = await import("@/lib/ai-provider.server");
    const brief = data.platforms.map((p) => `- ${PLATFORM_BRIEF[p] ?? p}`).join("\n");

    const text = await generateAiText({
      system:
        "You are a senior social media copywriter. Write native, platform-specific copy. " +
        "Never reuse the same wording across platforms — each variant must read as if written for that app only. " +
        "Respect every stated character limit. " +
        'Reply with raw JSON only (no markdown, no prose) shaped as {"cards":[{"platform":"...","title":"","hook":"","caption":"","description":"","hashtags":[],"keywords":[],"tags":[],"callToAction":"","altText":"","firstComment":"","pinnedComment":"","overlayText":""}]}. ' +
        'Use "" or [] for any field that does not apply to a platform, and use the exact platform ids given.',
      prompt: [
        `Media type: ${data.mediaType}.`,
        `Tone: ${data.tone}.`,
        `Post idea / source notes:\n${data.idea || "A short lifestyle clip for a creator brand."}`,
        `Write one distinct variant for each of these platforms:\n${brief}`,
        `platform must be exactly one of: ${data.platforms.join(", ")}. Return JSON only.`,
      ].join("\n\n"),
      userId: context.userId,
      maxOutputTokens: 8_000,
    });

    const cards = parseCards(text);
    if (cards.length === 0) {
      throw new Error("The AI writer returned an unexpected response — try again.");
    }

    // Match loosely: models sometimes title-case or alias the platform id.
    const wanted = new Set<string>(data.platforms);
    return cards
      .map((c) => ({ ...c, platform: c.platform.trim().toLowerCase() }))
      .filter((c) => wanted.has(c.platform));
  });
