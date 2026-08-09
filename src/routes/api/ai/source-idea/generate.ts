// POST /api/ai/source-idea/generate — authenticated HTTP endpoint that returns
// the full structured, per-platform generation for one source title.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sourceIdeaRequestSchema, checkRateLimit } from "@/lib/source-idea.functions";
import type { SourcePlatformContent } from "@/lib/source-idea";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serialize(c: SourcePlatformContent) {
  return {
    title: c.title,
    hook: c.hook,
    caption: c.caption,
    description: c.description,
    short_description: c.shortDescription,
    cta: c.cta,
    hashtags: c.hashtags,
    trending_style_hashtags: c.trendingStyleHashtags,
    keywords: c.keywords,
    tags: c.tags,
    alt_text: c.altText,
    first_comment: c.firstComment,
    pinned_comment: c.pinnedComment,
    overlay_text: c.overlayText,
    board_suggestion: c.boardSuggestion,
    thumbnail_text: c.thumbnailText,
    emoji_caption: c.emojiCaption,
    clean_caption: c.cleanCaption,
    engagement_question: c.engagementQuestion,
    emoji_suggestion: c.emojiSuggestion,
  };
}

export const Route = createFileRoute("/api/ai/source-idea/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return json({ error: "Backend is not configured." }, 500);

        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json({ error: "Unauthorized" }, 401);

        const supabase = createClient(url, key, { auth: { persistSession: false } });
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }

        const parsed = sourceIdeaRequestSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid request", issues: parsed.error.issues }, 400);
        }

        try {
          checkRateLimit(userData.user.id);
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Rate limited" }, 429);
        }

        const { generateSourceIdeaBatch } = await import("@/lib/source-idea.server");
        const input = {
          title: parsed.data.title,
          language: parsed.data.language,
          tone: parsed.data.tone,
          targetAudience: parsed.data.target_audience,
          location: parsed.data.location,
        };
        const batch = await generateSourceIdeaBatch(
          input,
          parsed.data.platforms,
          userData.user.id,
        );

        const platforms: Record<string, ReturnType<typeof serialize>> = {};
        for (const [platform, content] of Object.entries(batch.platforms)) {
          if (content) platforms[platform] = serialize(content);
        }

        return json({
          source_analysis: {
            original_title: batch.analysis.originalTitle,
            improved_title: batch.analysis.improvedTitle,
            topic: batch.analysis.topic,
            category: batch.analysis.category,
            search_intent: batch.analysis.searchIntent,
            target_audience: batch.analysis.targetAudience,
            tone: batch.analysis.tone,
            keywords: batch.analysis.keywords,
          },
          platforms,
          warnings: batch.warnings,
        });
      },
    },
  },
});
