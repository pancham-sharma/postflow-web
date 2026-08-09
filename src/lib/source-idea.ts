// Client-safe model for the "Generate for All Platforms" action in the Source
// Idea card. One title in, one independent content record per platform out.

export const SOURCE_IDEA_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "youtube_shorts",
  "pinterest",
  "snapchat",
  "linkedin",
] as const;

export type SourceIdeaPlatform = (typeof SOURCE_IDEA_PLATFORMS)[number];

export const SOURCE_IDEA_PLATFORM_LABEL: Record<SourceIdeaPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  youtube_shorts: "YouTube Shorts",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
};

export const SOURCE_IDEA_LANGUAGES = [
  "English",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Arabic",
  "Japanese",
] as const;

export const SOURCE_IDEA_TONES = [
  "Engaging",
  "Professional",
  "Casual",
  "Educational",
  "Inspirational",
  "Funny",
  "Luxury",
  "Minimal",
] as const;

/** One platform's generated content. Never shared with another platform. */
export type SourcePlatformContent = {
  platform: SourceIdeaPlatform;
  title: string;
  hook: string;
  caption: string;
  description: string;
  shortDescription: string;
  cta: string;
  hashtags: string[];
  trendingStyleHashtags: string[];
  keywords: string[];
  tags: string[];
  altText: string;
  firstComment: string;
  pinnedComment: string;
  overlayText: string;
  boardSuggestion: string;
  thumbnailText: string;
  emojiCaption: string;
  cleanCaption: string;
  engagementQuestion: string;
  emojiSuggestion: string;
};

export type SourceAnalysis = {
  originalTitle: string;
  improvedTitle: string;
  topic: string;
  category: string;
  searchIntent: string;
  targetAudience: string;
  tone: string;
  keywords: string[];
};

export type SourceIdeaInput = {
  title: string;
  language: string;
  tone: string;
  targetAudience: string;
  location: string;
};

export const emptySourceIdeaInput: SourceIdeaInput = {
  title: "",
  language: "English",
  tone: "Engaging",
  targetAudience: "",
  location: "",
};

import type { PlatformContent } from "@/lib/platform-content";
import type { SocialPlatform } from "@/lib/social-platforms";

/** Which generator profile a connected account maps to. */
export function generatorPlatformFor(
  platform: SocialPlatform,
  options: { isShort?: boolean } = {},
): SourceIdeaPlatform {
  if (platform === "youtube") return options.isShort ? "youtube_shorts" : "youtube";
  return platform;
}

/** Fills one editable platform card from a generated record. */
export function applyGeneratedContent(
  base: PlatformContent,
  g: SourcePlatformContent,
): PlatformContent {
  const caption = g.caption || g.shortDescription || g.description;
  return {
    ...base,
    title: g.title || base.title,
    hook: g.hook || base.hook,
    caption: caption || base.caption,
    description: g.description || g.shortDescription || base.description,
    hashtags: g.hashtags.length ? g.hashtags.join(" ") : base.hashtags,
    trendingHashtags: g.trendingStyleHashtags.length
      ? g.trendingStyleHashtags.join(" ")
      : base.trendingHashtags,
    keywords: g.keywords.length ? g.keywords.join(", ") : base.keywords,
    tags: g.tags.length ? g.tags.join(", ") : base.tags,
    callToAction: g.cta || base.callToAction,
    altText: g.altText || base.altText,
    firstComment: g.firstComment || base.firstComment,
    pinnedComment: g.pinnedComment || base.pinnedComment,
    overlayText: g.overlayText || base.overlayText,
    aiGenerated: true,
    manuallyEdited: false,
  };
}

/** True when the user already has text in this card. */
export function cardHasContent(content: PlatformContent): boolean {
  return Boolean(
    content.title.trim() ||
      content.caption.trim() ||
      content.description.trim() ||
      content.hashtags.trim(),
  );
}
