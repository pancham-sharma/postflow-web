// AI Title Generator: the user supplies only a title (plus optional context) and
// the model returns fully separate, platform-native content for every card.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GENERATOR_PLATFORMS,
  IMPROVE_ACTIONS,
  STYLE_VARIANTS,
  emptyCard,
  type GeneratedPlatformCard,
  type GeneratorPlatform,
  type GeneratorResult,
  type TitleAnalysis,
} from "@/lib/title-generator";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : typeof v === "string"
      ? v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
      : [];

function withHash(values: string[]) {
  return values.map((v) => (v.startsWith("#") ? v : `#${v.replace(/^#+/, "")}`));
}

function normalizeCard(raw: unknown): GeneratedPlatformCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const platform = str(c["platform"]).toLowerCase().replace(/[\s-]+/g, "_");
  if (!(GENERATOR_PLATFORMS as readonly string[]).includes(platform)) return null;
  const base = emptyCard(platform as GeneratorPlatform);
  return {
    ...base,
    title: str(c["title"]),
    hook: str(c["hook"]),
    caption: str(c["caption"]),
    cleanCaption: str(c["cleanCaption"]),
    emojiCaption: str(c["emojiCaption"]),
    description: str(c["description"]),
    shortDescription: str(c["shortDescription"]),
    callToAction: str(c["callToAction"]),
    engagementQuestion: str(c["engagementQuestion"]),
    hashtags: withHash(list(c["hashtags"])),
    keywords: list(c["keywords"]),
    tags: list(c["tags"]),
    altText: str(c["altText"]),
    pinnedComment: str(c["pinnedComment"]),
    thumbnailText: str(c["thumbnailText"]),
    boardSuggestion: str(c["boardSuggestion"]),
    emojiSuggestion: str(c["emojiSuggestion"]),
    postingSuggestion: str(c["postingSuggestion"]),
    seoNotes: str(c["seoNotes"]),
  };
}

/** Parses the model reply, tolerating code fences and surrounding prose. */
function parseJson(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const candidates = [cleaned.match(/\{[\s\S]*\}/)?.[0], cleaned].filter(
    (v): v is string => typeof v === "string",
  );
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

async function runModel(system: string, prompt: string, userId: string): Promise<string> {
  const { generateAiText } = await import("@/lib/ai-provider.server");
  return generateAiText({ system, prompt, userId, maxOutputTokens: 8_000 });
}

const PLATFORM_BRIEF: Record<GeneratorPlatform, string> = {
  instagram:
    "instagram — viral scroll-stopping hook, caption up to 2200 chars, an emoji-rich version (emojiCaption) and an emoji-free version (cleanCaption), short CTA, alt text, 15-25 highly relevant hashtags mixing broad + niche + long-tail + community, one emoji suggestion, one posting suggestion.",
  facebook:
    "facebook — natural conversational post text, a longer description, an engagement question, CTA, only 5-10 hashtags.",
  youtube:
    "youtube — SEO title max 100 chars, long SEO description up to 5000 chars, shortDescription, 15-25 video tags, search keywords, max 5 hashtags, pinned comment, thumbnailText of 3-5 words, seoNotes explaining the SEO angle.",
  youtube_shorts:
    "youtube_shorts — punchy shorts title max 100 chars, 1-line hook, shortDescription, CTA, 3-6 short hashtags.",
  pinterest:
    "pinterest — keyword-first pin title max 100 chars, SEO description max 500 chars, 10-15 search keywords, max 5 hashtags, a board suggestion, alt text.",
  snapchat: "snapchat — very short casual caption max 250 chars, short CTA, at most 3 hashtags, emoji suggestion.",
  linkedin:
    "linkedin — professional insight-led hook, professional caption with line breaks, professional CTA, 5-10 industry hashtags, keywords.",
};

const CARD_SHAPE =
  '{"platform":"","title":"","hook":"","caption":"","cleanCaption":"","emojiCaption":"","description":"","shortDescription":"","callToAction":"","engagementQuestion":"","hashtags":[],"keywords":[],"tags":[],"altText":"","pinnedComment":"","thumbnailText":"","boardSuggestion":"","emojiSuggestion":"","postingSuggestion":"","seoNotes":""}';

const EXPERT_SYSTEM =
  "You are a combined social media expert, SEO expert, copywriter, content strategist, growth marketer and hashtag research specialist. " +
  "You write native copy for each platform: never reuse wording, structure or hashtags across platforms. " +
  "Respect every stated character limit. Never invent facts that the title does not support. " +
  'Never claim a hashtag is currently trending — treat estimates as "trending-style suggestions". ' +
  "Reply with raw JSON only: no markdown fences, no prose.";

const contextInput = z.object({
  title: z.string().trim().min(3).max(300),
  brand: z.string().trim().max(120).default(""),
  language: z.string().trim().max(60).default("English"),
  tone: z.string().trim().max(60).default(""),
  audience: z.string().trim().max(120).default(""),
  country: z.string().trim().max(80).default(""),
  category: z.string().trim().max(80).default(""),
  style: z.enum(STYLE_VARIANTS).default("professional"),
});

function contextLines(data: z.infer<typeof contextInput>) {
  return [
    `Title / topic: ${data.title}`,
    data.brand && `Brand: ${data.brand}`,
    `Language: ${data.language || "English"}`,
    data.tone && `Tone: ${data.tone}`,
    data.audience && `Target audience: ${data.audience}`,
    data.country && `Target country: ${data.country}`,
    data.category && `Category: ${data.category}`,
    `Style variant: ${data.style} — the whole output must read in this style.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const generateInput = contextInput.extend({
  platforms: z.array(z.enum(GENERATOR_PLATFORMS)).min(1).max(7),
});

/** Analyses the title, then writes one distinct card per selected platform. */
export const generateFromTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateInput.parse(data))
  .handler(async ({ data, context }): Promise<GeneratorResult> => {
    const brief = data.platforms.map((p) => `- ${PLATFORM_BRIEF[p]}`).join("\n");
    const text = await runModel(
      EXPERT_SYSTEM,
      [
        contextLines(data),
        "Step 1 — analyse the title only. If it is short or ambiguous, infer the most likely meaning without inventing unsupported facts.",
        `Step 2 — write completely different content for each platform:\n${brief}`,
        "Step 3 — suggest 6 related content ideas based on the title and general knowledge. These are suggested related topics, not verified trends.",
        `Return JSON exactly shaped as {"analysis":{"mainTopic":"","category":"","targetAudience":"","searchIntent":"","userIntent":"","contentType":"","writingStyle":"","platformStrategy":""},"cards":[${CARD_SHAPE}],"relatedTopics":[""]}.`,
        `Use "" or [] for fields that do not apply. platform must be exactly one of: ${data.platforms.join(", ")}. Return JSON only.`,
      ].join("\n\n"),
      context.userId,
    );

    const parsed = parseJson(text);
    const rawCards = Array.isArray(parsed?.["cards"]) ? (parsed["cards"] as unknown[]) : [];
    const cards = rawCards
      .map(normalizeCard)
      .filter((c): c is GeneratedPlatformCard => c !== null)
      .filter((c) => data.platforms.includes(c.platform));
    if (cards.length === 0) {
      throw new Error("The AI writer returned an unexpected response — try again.");
    }

    const rawAnalysis = (parsed?.["analysis"] ?? {}) as Record<string, unknown>;
    const analysis: TitleAnalysis = {
      mainTopic: str(rawAnalysis["mainTopic"]) || data.title,
      category: str(rawAnalysis["category"]) || data.category,
      targetAudience: str(rawAnalysis["targetAudience"]) || data.audience,
      searchIntent: str(rawAnalysis["searchIntent"]),
      userIntent: str(rawAnalysis["userIntent"]),
      contentType: str(rawAnalysis["contentType"]),
      writingStyle: str(rawAnalysis["writingStyle"]),
      platformStrategy: str(rawAnalysis["platformStrategy"]),
    };

    return { analysis, cards, relatedTopics: list(parsed?.["relatedTopics"]).slice(0, 8) };
  });

const regenerateInput = contextInput.extend({
  platform: z.enum(GENERATOR_PLATFORMS),
  avoid: z.string().trim().max(4000).default(""),
});

/** Rewrites a single platform card from scratch. */
export const regeneratePlatformCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => regenerateInput.parse(data))
  .handler(async ({ data, context }): Promise<GeneratedPlatformCard> => {
    const text = await runModel(
      EXPERT_SYSTEM,
      [
        contextLines(data),
        `Write a fresh variant for this platform only:\n- ${PLATFORM_BRIEF[data.platform]}`,
        data.avoid && `Do not repeat this previous version:\n${data.avoid}`,
        `Return JSON exactly shaped as {"card":${CARD_SHAPE}} with platform set to "${data.platform}". Return JSON only.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      context.userId,
    );
    const parsed = parseJson(text);
    const card = normalizeCard(parsed?.["card"] ?? parsed);
    if (!card || card.platform !== data.platform) {
      throw new Error("The AI writer returned an unexpected response — try again.");
    }
    return card;
  });

const improveInput = z.object({
  action: z.enum(IMPROVE_ACTIONS),
  platform: z.enum(GENERATOR_PLATFORMS),
  fieldLabel: z.string().trim().max(80).default("text"),
  value: z.string().trim().max(6000).default(""),
  title: z.string().trim().max(300).default(""),
  language: z.string().trim().max(60).default("English"),
  isList: z.boolean().default(false),
  maxChars: z.number().int().positive().max(6000).nullable().default(null),
});

const ACTION_BRIEF: Record<(typeof IMPROVE_ACTIONS)[number], string> = {
  improve_title: "Rewrite it as a stronger, clearer, more clickable title.",
  improve_caption: "Rewrite it as a stronger caption with a better opening line and flow.",
  better_hook: "Rewrite it as a sharper scroll-stopping hook.",
  more_hashtags: "Return a longer, more varied hashtag set: broad, niche, long-tail and community tags. No duplicates.",
  seo_version: "Rewrite it keyword-first for search discovery, keeping it natural.",
  viral_version: "Rewrite it for maximum shareability and curiosity, without clickbait lies.",
  professional_version: "Rewrite it in a polished, professional, credible voice.",
  translate: "Translate it into the requested language, keeping the marketing intent.",
  shorten: "Make it noticeably shorter while keeping the core message.",
  expand: "Expand it with more useful detail, keeping it on-topic.",
  rewrite: "Rewrite it completely differently while keeping the same intent.",
};

/** Runs one auto-improve action against a single field. */
export const improveField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => improveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ value: string; items: string[] }> => {
    const text = await runModel(
      EXPERT_SYSTEM,
      [
        `Platform: ${data.platform}. Field: ${data.fieldLabel}. Language: ${data.language || "English"}.`,
        data.title && `Post title / topic: ${data.title}`,
        `Current value:\n${data.value || "(empty — write it from the title)"}`,
        ACTION_BRIEF[data.action],
        data.maxChars ? `Hard limit: ${data.maxChars} characters.` : "",
        data.isList
          ? 'Return JSON shaped as {"items":["#tag"]} — hashtags start with #, keywords do not.'
          : 'Return JSON shaped as {"value":"..."}.',
        "Return JSON only.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      context.userId,
    );
    const parsed = parseJson(text);
    if (data.isList) {
      const items = list(parsed?.["items"]);
      if (items.length === 0) throw new Error("The AI writer returned an unexpected response — try again.");
      return { value: "", items };
    }
    const value = str(parsed?.["value"]);
    if (!value) throw new Error("The AI writer returned an unexpected response — try again.");
    return { value: data.maxChars ? value.slice(0, data.maxChars) : value, items: [] };
  });
