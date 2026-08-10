// Per-platform content model. One uploaded media, one independently editable
// content card per selected platform — nothing is shared between cards.
import type { SocialPlatform } from "@/lib/social-platforms";

export type PlatformFieldKey =
  | "title"
  | "hook"
  | "caption"
  | "description"
  | "hashtags"
  | "trendingHashtags"
  | "keywords"
  | "tags"
  | "callToAction"
  | "altText"
  | "firstComment"
  | "pinnedComment"
  | "overlayText"
  | "destinationUrl"
  | "location";

export type PlatformContent = Record<PlatformFieldKey, string> & {
  scheduledFor: string;
  aiGenerated: boolean;
  manuallyEdited: boolean;
  settings: Record<string, unknown>;
};

export const emptyPlatformContent: PlatformContent = {
  title: "",
  hook: "",
  caption: "",
  description: "",
  hashtags: "",
  trendingHashtags: "",
  keywords: "",
  tags: "",
  callToAction: "",
  altText: "",
  firstComment: "",
  pinnedComment: "",
  overlayText: "",
  destinationUrl: "",
  location: "",
  scheduledFor: "",
  aiGenerated: false,
  manuallyEdited: false,
  settings: {},
};

export type FieldDef = {
  key: PlatformFieldKey;
  label: string;
  kind: "text" | "textarea" | "list";
  max?: number;
  maxItems?: number;
  required?: boolean;
  placeholder?: string;
  help?: string;
};

const f = (def: FieldDef): FieldDef => def;

/** The editable field set for each platform, with that platform's own limits. */
export const PLATFORM_FIELDS: Record<SocialPlatform, FieldDef[]> = {
  instagram: [
    f({ key: "hook", label: "Hook", kind: "text", max: 120, placeholder: "First line that stops the scroll" }),
    f({ key: "caption", label: "Caption", kind: "textarea", max: 2200, placeholder: "Write the Instagram caption" }),
    f({ key: "hashtags", label: "Hashtags", kind: "list", maxItems: 30, placeholder: "#studio #bts #reels" }),
  f({ key: "trendingHashtags", label: "Trending-style hashtag suggestions", kind: "list", maxItems: 15, help: "Estimated suggestions — not verified live trends" }),
    f({ key: "callToAction", label: "Call to action", kind: "text", max: 120, placeholder: "Save this for later" }),
    f({ key: "firstComment", label: "First comment", kind: "textarea", max: 2200, placeholder: "Extra hashtags or context posted as the first comment" }),
    f({ key: "location", label: "Location", kind: "text", max: 120, placeholder: "Lisbon, Portugal" }),
    f({ key: "altText", label: "Alt text", kind: "text", max: 1000, placeholder: "Describe the media for screen readers" }),
  ],
  facebook: [
    f({ key: "title", label: "Title", kind: "text", max: 255, placeholder: "Optional headline" }),
    f({ key: "caption", label: "Post text", kind: "textarea", max: 5000, placeholder: "Write the Facebook post" }),
    f({ key: "description", label: "Description", kind: "textarea", max: 5000, placeholder: "Longer context shown with the link" }),
    f({ key: "hashtags", label: "Hashtags", kind: "list", maxItems: 30 }),
  f({ key: "trendingHashtags", label: "Trending-style hashtag suggestions", kind: "list", maxItems: 15, help: "Estimated suggestions — not verified live trends" }),
    f({ key: "callToAction", label: "Call to action", kind: "text", max: 120 }),
    f({ key: "destinationUrl", label: "Destination link", kind: "text", max: 2000, placeholder: "https://example.com" }),
    f({ key: "firstComment", label: "First comment", kind: "textarea", max: 2000 }),
    f({ key: "altText", label: "Alt text", kind: "text", max: 1000 }),
  ],
  pinterest: [
    f({ key: "title", label: "Pin title", kind: "text", max: 100, placeholder: "Searchable pin title" }),
    f({ key: "description", label: "Pin description", kind: "textarea", max: 500, placeholder: "Keyword-rich description" }),
    f({ key: "keywords", label: "Keywords", kind: "list", maxItems: 25, placeholder: "autumn outfits, capsule wardrobe" }),
    f({ key: "hashtags", label: "Hashtags", kind: "list", maxItems: 20 }),
  f({ key: "trendingHashtags", label: "Trending-style hashtag suggestions", kind: "list", maxItems: 15, help: "Estimated suggestions — not verified live trends" }),
    f({ key: "destinationUrl", label: "Destination link", kind: "text", max: 2000, placeholder: "https://example.com/product" }),
    f({ key: "altText", label: "Alt text", kind: "text", max: 500 }),
  ],
  youtube: [
    f({ key: "title", label: "Video title", kind: "text", max: 100, required: true, placeholder: "Title shown on YouTube" }),
    f({ key: "hook", label: "Hook", kind: "text", max: 150, placeholder: "First line of the description" }),
    f({ key: "description", label: "Description", kind: "textarea", max: 5000, placeholder: "Full video description" }),
    f({ key: "tags", label: "Tags", kind: "list", maxItems: 40, placeholder: "editing, tutorial, shorts" }),
    f({ key: "hashtags", label: "Hashtags", kind: "list", maxItems: 15, help: "Only the first 3 show above the title" }),
  f({ key: "trendingHashtags", label: "Trending-style hashtag suggestions", kind: "list", maxItems: 15, help: "Estimated suggestions — not verified live trends" }),
    f({ key: "callToAction", label: "Call to action", kind: "text", max: 150 }),
    f({ key: "pinnedComment", label: "Pinned comment", kind: "textarea", max: 2000 }),
  ],
  snapchat: [
    f({ key: "caption", label: "Caption", kind: "textarea", max: 160, placeholder: "Short Snapchat Spotlight caption (Spotlight only)" }),
    f({ key: "hashtags", label: "Hashtags", kind: "list", maxItems: 5, placeholder: "#trending #snapchat" }),
    f({ key: "trendingHashtags", label: "Trending-style hashtag suggestions", kind: "list", maxItems: 5, help: "Estimated suggestions — not verified live trends" }),
    f({ key: "overlayText", label: "Overlay text", kind: "text", max: 80, placeholder: "Text shown over the snap" }),
    f({ key: "callToAction", label: "Call to action", kind: "text", max: 80, placeholder: "Swipe up" }),
    f({ key: "destinationUrl", label: "Attachment link", kind: "text", max: 2000 }),
  ],
};

export function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .flatMap((part) => (part.trim().startsWith("#") ? part.trim().split(/\s+/) : [part]))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function hashtagList(value: string): string[] {
  return splitList(value).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

export type CardIssue = { field: PlatformFieldKey | "media"; message: string };

/** Validates one card against its own platform rules. */
export function validatePlatformContent(
  platform: SocialPlatform,
  content: PlatformContent,
  options: { hasMedia: boolean },
): CardIssue[] {
  const issues: CardIssue[] = [];
  for (const field of PLATFORM_FIELDS[platform]) {
    const raw = content[field.key] ?? "";
    if (field.required && !raw.trim()) {
      issues.push({ field: field.key, message: `${field.label} is required for this platform.` });
      continue;
    }
    if (field.kind === "list") {
      const count = splitList(raw).length;
      if (field.maxItems && count > field.maxItems) {
        issues.push({ field: field.key, message: `${field.label}: keep ${field.maxItems} or fewer.` });
      }
    } else if (field.max && raw.length > field.max) {
      issues.push({ field: field.key, message: `${field.label} is over the ${field.max} character limit.` });
    }
    if (field.key === "destinationUrl" && raw.trim() && !/^https?:\/\//i.test(raw.trim())) {
      issues.push({ field: field.key, message: "Destination link must start with http:// or https://." });
    }
  }
  if (!options.hasMedia && platform !== "facebook") {
    issues.push({ field: "media", message: "This platform needs an image or video." });
  }
  if (
    platform === "facebook" &&
    !options.hasMedia &&
    !content.caption.trim() &&
    !content.destinationUrl.trim()
  ) {
    issues.push({
      field: "caption",
      message: "Add post text or a destination link for a Facebook text post.",
    });
  }
  return issues;
}

export function charCount(content: PlatformContent, field: FieldDef) {
  const raw = content[field.key] ?? "";
  if (field.kind === "list") return `${splitList(raw).length}${field.maxItems ? `/${field.maxItems}` : ""}`;
  return `${raw.length}${field.max ? `/${field.max}` : ""}`;
}
