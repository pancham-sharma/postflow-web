// Client-safe model for the AI Title Generator: which platforms exist, which
// fields each one shows, and the style variants / improve actions offered.
import { Instagram, Facebook, Youtube, Pin, Ghost, Linkedin, Clapperboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const GENERATOR_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "youtube_shorts",
  "pinterest",
  "snapchat",
  "linkedin",
] as const;

export type GeneratorPlatform = (typeof GENERATOR_PLATFORMS)[number];

export const PLATFORM_META: Record<
  GeneratorPlatform,
  { name: string; icon: LucideIcon; blurb: string }
> = {
  instagram: { name: "Instagram", icon: Instagram, blurb: "Viral hook + hashtag stack" },
  facebook: { name: "Facebook", icon: Facebook, blurb: "Natural post + engagement question" },
  youtube: { name: "YouTube", icon: Youtube, blurb: "SEO title, long description, tags" },
  youtube_shorts: { name: "YouTube Shorts", icon: Clapperboard, blurb: "Punchy short-form hook" },
  pinterest: { name: "Pinterest", icon: Pin, blurb: "Search-first pin copy" },
  snapchat: { name: "Snapchat", icon: Ghost, blurb: "Ultra short + casual" },
  linkedin: { name: "LinkedIn", icon: Linkedin, blurb: "Professional, insight-led" },
};

export const STYLE_VARIANTS = [
  "professional",
  "viral",
  "educational",
  "funny",
  "luxury",
  "minimal",
] as const;
export type StyleVariant = (typeof STYLE_VARIANTS)[number];

export const IMPROVE_ACTIONS = [
  "improve_title",
  "improve_caption",
  "better_hook",
  "more_hashtags",
  "seo_version",
  "viral_version",
  "professional_version",
  "translate",
  "shorten",
  "expand",
  "rewrite",
] as const;
export type ImproveAction = (typeof IMPROVE_ACTIONS)[number];

export const IMPROVE_LABELS: Record<ImproveAction, string> = {
  improve_title: "Improve title",
  improve_caption: "Improve caption",
  better_hook: "Better hook",
  more_hashtags: "More hashtags",
  seo_version: "SEO version",
  viral_version: "Viral version",
  professional_version: "More professional",
  translate: "Translate",
  shorten: "Shorten",
  expand: "Expand",
  rewrite: "Rewrite",
};

export type GeneratedPlatformCard = {
  platform: GeneratorPlatform;
  title: string;
  hook: string;
  caption: string;
  cleanCaption: string;
  emojiCaption: string;
  description: string;
  shortDescription: string;
  callToAction: string;
  engagementQuestion: string;
  hashtags: string[];
  keywords: string[];
  tags: string[];
  altText: string;
  pinnedComment: string;
  thumbnailText: string;
  boardSuggestion: string;
  emojiSuggestion: string;
  postingSuggestion: string;
  seoNotes: string;
};

export type TitleAnalysis = {
  mainTopic: string;
  category: string;
  targetAudience: string;
  searchIntent: string;
  userIntent: string;
  contentType: string;
  writingStyle: string;
  platformStrategy: string;
};

export type GeneratorResult = {
  analysis: TitleAnalysis;
  cards: GeneratedPlatformCard[];
  relatedTopics: string[];
};

export type CardFieldKey =
  | "title"
  | "hook"
  | "caption"
  | "cleanCaption"
  | "emojiCaption"
  | "description"
  | "shortDescription"
  | "callToAction"
  | "engagementQuestion"
  | "altText"
  | "pinnedComment"
  | "thumbnailText"
  | "boardSuggestion"
  | "emojiSuggestion"
  | "postingSuggestion"
  | "seoNotes";

export type ListFieldKey = "hashtags" | "keywords" | "tags";

type FieldDef = { key: CardFieldKey; label: string; kind: "text" | "textarea"; max?: number };
type ListDef = { key: ListFieldKey; label: string; hint?: string };

const t = (key: CardFieldKey, label: string, max?: number): FieldDef =>
  max === undefined ? { key, label, kind: "text" } : { key, label, kind: "text", max };
const a = (key: CardFieldKey, label: string, max?: number): FieldDef =>
  max === undefined ? { key, label, kind: "textarea" } : { key, label, kind: "textarea", max };

/** Which editable fields each platform card shows, with that platform's limits. */
export const CARD_FIELDS: Record<GeneratorPlatform, FieldDef[]> = {
  instagram: [
    t("title", "Title", 120),
    t("hook", "Viral hook", 120),
    a("caption", "Caption", 2200),
    a("emojiCaption", "Emoji version", 2200),
    a("cleanCaption", "Clean version", 2200),
    t("callToAction", "Call to action", 120),
    t("altText", "Alt text", 1000),
    t("emojiSuggestion", "Emoji suggestion", 80),
    t("postingSuggestion", "Posting suggestion", 200),
  ],
  facebook: [
    t("title", "Title", 255),
    t("hook", "Hook", 150),
    a("caption", "Post text", 5000),
    a("description", "Longer description", 5000),
    t("engagementQuestion", "Engagement question", 200),
    t("callToAction", "Call to action", 150),
    t("postingSuggestion", "Posting suggestion", 200),
  ],
  youtube: [
    t("title", "SEO title", 100),
    t("hook", "Hook", 150),
    a("description", "Long SEO description", 5000),
    a("shortDescription", "Short description", 500),
    a("pinnedComment", "Pinned comment", 2000),
    t("thumbnailText", "Thumbnail text", 40),
    t("callToAction", "Call to action", 150),
    a("seoNotes", "SEO notes", 500),
  ],
  youtube_shorts: [
    t("title", "Shorts title", 100),
    t("hook", "Hook", 120),
    a("shortDescription", "Short description", 500),
    t("callToAction", "Call to action", 120),
    t("postingSuggestion", "Posting suggestion", 200),
  ],
  pinterest: [
    t("title", "Pin title", 100),
    a("description", "SEO description", 500),
    t("boardSuggestion", "Board suggestion", 100),
    t("altText", "Alt text", 500),
    t("callToAction", "Call to action", 120),
  ],
  snapchat: [
    a("caption", "Short caption", 250),
    t("callToAction", "Call to action", 80),
    t("emojiSuggestion", "Emoji suggestion", 80),
  ],
  linkedin: [
    t("title", "Title", 150),
    t("hook", "Professional hook", 200),
    a("caption", "Professional caption", 3000),
    t("callToAction", "Professional CTA", 150),
    t("postingSuggestion", "Posting suggestion", 200),
  ],
};

/** Which list fields (chips) each card shows. */
export const CARD_LISTS: Record<GeneratorPlatform, ListDef[]> = {
  instagram: [
    { key: "hashtags", label: "Hashtags", hint: "15–25 · trending-style suggestions" },
    { key: "keywords", label: "Keywords" },
  ],
  facebook: [
    { key: "hashtags", label: "Hashtags", hint: "5–10" },
    { key: "keywords", label: "Keywords" },
  ],
  youtube: [
    { key: "tags", label: "Video tags" },
    { key: "keywords", label: "Search keywords" },
    { key: "hashtags", label: "Hashtags", hint: "first 3 show above the title" },
  ],
  youtube_shorts: [
    { key: "hashtags", label: "Short hashtags" },
    { key: "keywords", label: "Keywords" },
  ],
  pinterest: [
    { key: "keywords", label: "Search keywords" },
    { key: "hashtags", label: "Hashtags" },
  ],
  snapchat: [{ key: "hashtags", label: "Minimal hashtags" }],
  linkedin: [
    { key: "hashtags", label: "Industry hashtags" },
    { key: "keywords", label: "Keywords" },
  ],
};

export function emptyCard(platform: GeneratorPlatform): GeneratedPlatformCard {
  return {
    platform,
    title: "",
    hook: "",
    caption: "",
    cleanCaption: "",
    emojiCaption: "",
    description: "",
    shortDescription: "",
    callToAction: "",
    engagementQuestion: "",
    hashtags: [],
    keywords: [],
    tags: [],
    altText: "",
    pinnedComment: "",
    thumbnailText: "",
    boardSuggestion: "",
    emojiSuggestion: "",
    postingSuggestion: "",
    seoNotes: "",
  };
}

/** Plain-text export of one card, used by the Copy button. */
export function cardToText(card: GeneratedPlatformCard): string {
  const lines: string[] = [`${PLATFORM_META[card.platform].name}`, ""];
  for (const field of CARD_FIELDS[card.platform]) {
    const value = card[field.key];
    if (value) lines.push(`${field.label}: ${value}`, "");
  }
  for (const list of CARD_LISTS[card.platform]) {
    const value = card[list.key];
    if (value.length > 0) lines.push(`${list.label}: ${value.join(" ")}`, "");
  }
  return lines.join("\n").trim();
}
