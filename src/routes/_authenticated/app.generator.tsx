import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Wand2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/form-styles";
import { GeneratorCard } from "@/components/generator/generator-card";
import {
  GENERATOR_PLATFORMS,
  PLATFORM_META,
  STYLE_VARIANTS,
  cardToText,
  type CardFieldKey,
  type GeneratedPlatformCard,
  type GeneratorPlatform,
  type ImproveAction,
  type ListFieldKey,
  type StyleVariant,
  type TitleAnalysis,
} from "@/lib/title-generator";
import {
  generateFromTitle,
  improveField,
  regeneratePlatformCard,
} from "@/lib/title-generator.functions";

export const Route = createFileRoute("/_authenticated/app/generator")({
  head: () => ({
    meta: [
      { title: "AI Title Generator — PostFlow" },
      {
        name: "description",
        content:
          "Enter one title and generate platform-native captions, hooks, hashtags and SEO copy for Instagram, Facebook, YouTube, Pinterest, Snapchat and LinkedIn.",
      },
      { property: "og:title", content: "AI Title Generator — PostFlow" },
      {
        property: "og:description",
        content: "Turn a single title into optimized, separate content for every social platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneratorPage,
});

const STORAGE_KEY = "postflow:title-generator";

type Context = {
  title: string;
  brand: string;
  language: string;
  tone: string;
  audience: string;
  country: string;
  category: string;
  style: StyleVariant;
};

const emptyContext: Context = {
  title: "",
  brand: "",
  language: "English",
  tone: "",
  audience: "",
  country: "",
  category: "",
  style: "professional",
};

const DEFAULT_PLATFORMS: GeneratorPlatform[] = [...GENERATOR_PLATFORMS];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function AnalysisPanel({ analysis }: { analysis: TitleAnalysis }) {
  const rows: [string, string][] = [
    ["Main topic", analysis.mainTopic],
    ["Category", analysis.category],
    ["Audience", analysis.targetAudience],
    ["Search intent", analysis.searchIntent],
    ["User intent", analysis.userIntent],
    ["Content type", analysis.contentType],
    ["Writing style", analysis.writingStyle],
    ["Platform strategy", analysis.platformStrategy],
  ].filter(([, v]) => Boolean(v)) as [string, string][];
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Title analysis</h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GeneratorPage() {
  const [context, setContext] = useState<Context>(emptyContext);
  const [platforms, setPlatforms] = useState<GeneratorPlatform[]>(DEFAULT_PLATFORMS);
  const [cards, setCards] = useState<GeneratedPlatformCard[]>([]);
  const [analysis, setAnalysis] = useState<TitleAnalysis | null>(null);
  const [relatedTopics, setRelatedTopics] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<GeneratorPlatform | null>(null);
  const [busy, setBusy] = useState<{ platform: GeneratorPlatform; field: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  const runGenerate = useServerFn(generateFromTitle);
  const runRegenerate = useServerFn(regeneratePlatformCard);
  const runImprove = useServerFn(improveField);

  // Restore the last saved session so edits survive a reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        context?: Context;
        cards?: GeneratedPlatformCard[];
        analysis?: TitleAnalysis;
        relatedTopics?: string[];
      };
      if (saved.context) setContext({ ...emptyContext, ...saved.context });
      if (Array.isArray(saved.cards)) setCards(saved.cards);
      if (saved.analysis) setAnalysis(saved.analysis);
      if (Array.isArray(saved.relatedTopics)) setRelatedTopics(saved.relatedTopics);
    } catch {
      /* ignore unreadable storage */
    }
  }, []);

  const persist = useCallback(
    (next: GeneratedPlatformCard[]) => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ context, cards: next, analysis, relatedTopics }),
        );
      } catch {
        /* storage unavailable */
      }
    },
    [context, analysis, relatedTopics],
  );

  const set = <K extends keyof Context>(key: K, value: Context[K]) =>
    setContext((c) => ({ ...c, [key]: value }));

  const togglePlatform = (platform: GeneratorPlatform) =>
    setPlatforms((list) =>
      list.includes(platform) ? list.filter((p) => p !== platform) : [...list, platform],
    );

  const payload = useMemo(() => ({ ...context, title: context.title.trim() }), [context]);

  const generate = async () => {
    if (payload.title.length < 3) {
      toast.error("Enter a title or topic first.");
      return;
    }
    if (platforms.length === 0) {
      toast.error("Select at least one platform.");
      return;
    }
    setGenerating(true);
    try {
      const result = await runGenerate({ data: { ...payload, platforms } });
      setCards(result.cards);
      setAnalysis(result.analysis);
      setRelatedTopics(result.relatedTopics);
      toast.success(`Generated ${result.cards.length} platform cards.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed — try again.");
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async (card: GeneratedPlatformCard) => {
    setRegenerating(card.platform);
    try {
      const next = await runRegenerate({
        data: { ...payload, platform: card.platform, avoid: cardToText(card).slice(0, 3000) },
      });
      setCards((list) => list.map((c) => (c.platform === card.platform ? next : c)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Regeneration failed — try again.");
    } finally {
      setRegenerating(null);
    }
  };

  const improve = async (
    card: GeneratedPlatformCard,
    args: {
      field: CardFieldKey | ListFieldKey;
      label: string;
      isList: boolean;
      maxChars: number | null;
      action: ImproveAction;
    },
  ) => {
    setBusy({ platform: card.platform, field: args.field });
    try {
      const current = args.isList
        ? (card[args.field as ListFieldKey] as string[]).join(" ")
        : (card[args.field as CardFieldKey] as string);
      const result = await runImprove({
        data: {
          action: args.action,
          platform: card.platform,
          fieldLabel: args.label,
          value: current,
          title: payload.title,
          language: context.language,
          isList: args.isList,
          maxChars: args.maxChars,
        },
      });
      setCards((list) =>
        list.map((c) =>
          c.platform === card.platform
            ? { ...c, [args.field]: args.isList ? result.items : result.value }
            : c,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That improvement failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Wand2 className="size-5 text-primary" aria-hidden />
          AI Title Generator
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter one title. Every platform gets its own optimized copy, hashtags and SEO angle.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4">
          <Field label="Title or topic">
            <input
              value={context.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Top 10 AI Tools for Students"
              className={inputCls}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Brand (optional)">
              <input value={context.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Language">
              <input value={context.language} onChange={(e) => set("language", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Tone (optional)">
              <input
                value={context.tone}
                onChange={(e) => set("tone", e.target.value)}
                placeholder="friendly and confident"
                className={inputCls}
              />
            </Field>
            <Field label="Target audience (optional)">
              <input value={context.audience} onChange={(e) => set("audience", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Target country (optional)">
              <input value={context.country} onChange={(e) => set("country", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Category (optional)">
              <input value={context.category} onChange={(e) => set("category", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Style variant
            </span>
            <div className="flex flex-wrap gap-2">
              {STYLE_VARIANTS.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => set("style", variant)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                    context.style === variant
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {variant}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Platforms
            </span>
            <div className="flex flex-wrap gap-2">
              {GENERATOR_PLATFORMS.map((platform) => {
                const meta = PLATFORM_META[platform];
                const Icon = meta.icon;
                const active = platforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {meta.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {generating ? "Generating…" : "Generate content"}
            </button>
          </div>
        </div>
      </section>

      {analysis && <AnalysisPanel analysis={analysis} />}

      {relatedTopics.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="size-4 text-primary" aria-hidden />
            Suggested related topics
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Idea suggestions based on your title and general knowledge — not verified live trend data.
          </p>
          <ul className="flex flex-wrap gap-2">
            {relatedTopics.map((topic) => (
              <li key={topic}>
                <button
                  type="button"
                  onClick={() => set("title", topic)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                >
                  {topic}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cards.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <GeneratorCard
              key={card.platform}
              card={card}
              editing={Boolean(editing[card.platform])}
              regenerating={regenerating === card.platform}
              busyField={busy?.platform === card.platform ? busy.field : null}
              onToggleEdit={() =>
                setEditing((state) => ({ ...state, [card.platform]: !state[card.platform] }))
              }
              onChange={(patch) =>
                setCards((list) =>
                  list.map((c) => (c.platform === card.platform ? { ...c, ...patch } : c)),
                )
              }
              onRegenerate={() => void regenerate(card)}
              onSave={() => {
                persist(cards);
                toast.success(`${PLATFORM_META[card.platform].name} card saved.`);
              }}
              onImprove={(args) => void improve(card, args)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
