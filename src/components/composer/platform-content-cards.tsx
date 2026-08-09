import { memo, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SnapchatDestinationPicker } from "@/components/composer/snapchat-destination";
import type { SnapchatDestination } from "@/lib/snapchat-media-validation";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import {
  PLATFORM_FIELDS,
  charCount,
  emptyPlatformContent,
  validatePlatformContent,
  type CardIssue,
  type PlatformContent,
} from "@/lib/platform-content";
import { inputCls } from "@/components/form-styles";

export type CardTarget = {
  /** Unique per selected account — one card per account, never shared. */
  id: string;
  accountId: string;
  platform: SocialPlatform;
  accountLabel: string;
};

export type CardState = Record<string, PlatformContent>;

function Row({
  label,
  hint,
  children,
  invalid,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <span className={cn("font-medium normal-case tracking-normal", invalid && "text-destructive")}>
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const PlatformCard = memo(function PlatformCard({
  target,
  content,
  issues,
  error,
  open,
  onToggle,
  onChange,
  onGenerate,
  onCopyFrom,
  generating,
  otherTargets,
  extra,
}: {
  target: CardTarget;
  content: PlatformContent;
  issues: CardIssue[];
  error?: string;
  open: boolean;
  onToggle: () => void;
  onChange: (next: PlatformContent) => void;
  onGenerate: () => void;
  onCopyFrom: (sourceCardId: string) => void;
  generating: boolean;
  otherTargets: CardTarget[];
  /** Per-platform audio editor injected by the composer. */
  extra?: ReactNode;
}) {
  const meta = platformMap[target.platform];
  const ready = issues.length === 0;

  function set<K extends keyof PlatformContent>(key: K, value: PlatformContent[K]) {
    onChange({ ...content, [key]: value, manuallyEdited: true });
  }

  return (
    <section className={cn("rounded-2xl border", ready ? "border-border" : "border-destructive/50")}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {meta && <meta.icon className="size-5 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {meta?.name ?? target.platform}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{target.accountLabel}</span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              ready ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
            )}
          >
            {ready ? <Check className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
            {ready ? "Ready" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`}
          </span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              AI generation failed for this platform: {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {generating ? "Writing…" : "AI rewrite for this platform"}
            </button>
            {otherTargets.length > 0 && (
              <select
                aria-label="Copy content from another platform"
                value=""
                onChange={(e) => {
                  if (e.target.value) onCopyFrom(e.target.value);
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Copy from…</option>
                {otherTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {platformMap[t.platform]?.name ?? t.platform} · {t.accountLabel}
                  </option>
                ))}
              </select>
            )}
            {content.aiGenerated && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="size-3" aria-hidden /> AI generated
                {content.manuallyEdited ? " · edited" : ""}
              </span>
            )}
          </div>

          {PLATFORM_FIELDS[target.platform].map((field) => {
            const invalid = issues.some((i) => i.field === field.key);
            const value = content[field.key];
            return (
              <Row
                key={field.key}
                label={field.label + (field.required ? " *" : "")}
                hint={field.help ?? charCount(content, field)}
                invalid={invalid}
              >
                {field.kind === "textarea" ? (
                  <textarea
                    className={cn(inputCls, "min-h-24 resize-y", invalid && "border-destructive")}
                    value={value}
                    placeholder={field.placeholder ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : (
                  <input
                    className={cn(inputCls, invalid && "border-destructive")}
                    value={value}
                    placeholder={field.placeholder ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                )}
              </Row>
            );
          })}

          <Row label="Schedule this platform (optional)">
            <input
              type="datetime-local"
              className={inputCls}
              value={content.scheduledFor}
              onChange={(e) => set("scheduledFor", e.target.value)}
            />
          </Row>

          {extra}

          {target.platform === "snapchat" && (
            <SnapchatDestinationPicker
              value={(content.settings["snapchat_destination"] as SnapchatDestination) ?? null}
              onChange={(next) =>
                onChange({
                  ...content,
                  settings: { ...content.settings, snapchat_destination: next },
                })
              }
            />
          )}

          {issues.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
});

/**
 * Renders one fully independent content card per selected account. No field is
 * shared: editing Instagram never changes YouTube.
 */
export function PlatformContentCards({
  targets,
  values,
  hasMedia,
  errors,
  generatingCardId,
  generatingAll,
  onChangeCard,
  onGenerateCard,
  onGenerateAll,
  renderExtra,
}: {
  targets: CardTarget[];
  values: CardState;
  hasMedia: boolean;
  errors?: Record<string, string>;
  generatingCardId: string | null;
  generatingAll: boolean;
  onChangeCard: (cardId: string, next: PlatformContent) => void;
  onGenerateCard: (cardId: string) => void;
  onGenerateAll: () => void;
  /** Extra content (audio editor) rendered inside each expanded card. */
  renderExtra?: (target: CardTarget) => ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(targets[0]?.id ?? null);

  const issuesByCard = useMemo(() => {
    const map: Record<string, CardIssue[]> = {};
    for (const t of targets) {
      map[t.id] = validatePlatformContent(t.platform, values[t.id] ?? emptyPlatformContent, {
        hasMedia,
      });
    }
    return map;
  }, [targets, values, hasMedia]);

  const readyCount = targets.filter((t) => (issuesByCard[t.id] ?? []).length === 0).length;

  if (targets.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-primary/50 p-5 text-sm text-muted-foreground">
        Select at least one connected account to get its own content card.
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Platform content · {readyCount}/{targets.length} ready
        </h2>
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={generatingAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {generatingAll ? "Writing every card…" : "AI generate all platforms"}
        </button>
      </div>

      {targets.map((target) => (
        <PlatformCard
          key={target.id}
          target={target}
          content={values[target.id] ?? emptyPlatformContent}
          issues={issuesByCard[target.id] ?? []}
          {...(errors?.[target.id] ? { error: errors[target.id] } : {})}
          open={openId === target.id}
          onToggle={() => setOpenId((cur) => (cur === target.id ? null : target.id))}
          onChange={(next) => onChangeCard(target.id, next)}
          onGenerate={() => onGenerateCard(target.id)}
          onCopyFrom={(sourceId) => {
            const source = values[sourceId];
            if (!source) return;
            onChangeCard(target.id, {
              ...(values[target.id] ?? emptyPlatformContent),
              title: source.title,
              hook: source.hook,
              caption: source.caption,
              description: source.description,
              hashtags: source.hashtags,
              keywords: source.keywords,
              tags: source.tags,
              callToAction: source.callToAction,
              altText: source.altText,
              manuallyEdited: true,
            });
          }}
          generating={generatingCardId === target.id}
          otherTargets={targets.filter((t) => t.id !== target.id)}
          {...(renderExtra ? { extra: renderExtra(target) } : {})}
        />
      ))}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Copy className="size-3.5" aria-hidden /> Each card publishes the same media with its own
        text and schedule.
      </p>
    </div>
  );
}
