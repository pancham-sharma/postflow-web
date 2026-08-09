import { memo, useState } from "react";
import { Check, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/form-styles";
import {
  SOURCE_IDEA_LANGUAGES,
  SOURCE_IDEA_TONES,
} from "@/lib/source-idea";

export interface PostDetailValues {
  title: string;
  caption: string;
  description: string;
  hashtags: string;
  linkUrl: string;
  altText: string;
  scheduledFor: string;
  language: string;
  tone: string;
  audience: string;
  location: string;
}

export const emptyPostDetails: PostDetailValues = {
  title: "",
  caption: "",
  description: "",
  hashtags: "",
  linkUrl: "",
  altText: "",
  scheduledFor: "",
  language: "English",
  tone: "Engaging",
  audience: "",
  location: "",
};

export type GenerateStatus = "idle" | "loading" | "success" | "error";

export type GenerateStep = {
  label: string;
  state: "pending" | "running" | "done" | "failed";
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && <span className="font-medium normal-case tracking-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function StepIcon({ state }: { state: GenerateStep["state"] }) {
  if (state === "running") return <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />;
  if (state === "done") return <Check className="size-3.5 text-primary" aria-hidden />;
  if (state === "failed") return <TriangleAlert className="size-3.5 text-destructive" aria-hidden />;
  return <span className="size-3.5 rounded-full border border-border" aria-hidden />;
}

/**
 * All caption/description text state lives inside this component and is mirrored
 * into a ref owned by the composer. Typing therefore re-renders only this card —
 * not the media uploader, the platform list, or the sticky publish bar.
 */
export const PostDetailsSection = memo(function PostDetailsSection({
  valuesRef,
  onScheduleChange,
  onChange,
  onGenerateAll,
  onCancelGenerate,
  onClear,
  generateStatus,
  steps,
}: {
  valuesRef: React.MutableRefObject<PostDetailValues>;
  onScheduleChange: (value: string) => void;
  onChange?: (values: PostDetailValues) => void;
  onGenerateAll: () => void;
  onCancelGenerate: () => void;
  onClear: () => void;
  generateStatus: GenerateStatus;
  steps: GenerateStep[];
}) {
  const [values, setValues] = useState<PostDetailValues>(valuesRef.current);

  function set<K extends keyof PostDetailValues>(key: K, value: PostDetailValues[K]) {
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    setValues(next);
    onChange?.(next);
  }

  function clearAll() {
    const next = { ...emptyPostDetails };
    valuesRef.current = next;
    setValues(next);
    onChange?.(next);
    onScheduleChange("");
    onClear();
  }

  const hashtagCount = values.hashtags.split(/[\s,]+/).filter(Boolean).length;
  const generating = generateStatus === "loading";
  const canGenerate = values.title.trim().length >= 3 && !generating;

  const buttonLabel =
    generating
      ? "Generating platform content…"
      : generateStatus === "success"
        ? "Content generated"
        : generateStatus === "error"
          ? "Try again"
          : "Generate for All Platforms";

  return (
    <section className="space-y-4 rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-5">
      <h2 className="text-base font-semibold">Source idea</h2>
      <p className="-mt-2 text-xs text-muted-foreground">
        Used as the internal name and as the brief the AI turns into a separate version for every
        platform. It is never published as-is.
      </p>

      <Field label="Title">
        <input
          className={inputCls}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Top 10 AI Tools for Students"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Language">
          <select
            className={inputCls}
            value={values.language}
            onChange={(e) => set("language", e.target.value)}
          >
            {SOURCE_IDEA_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tone">
          <select
            className={inputCls}
            value={values.tone}
            onChange={(e) => set("tone", e.target.value)}
          >
            {SOURCE_IDEA_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audience">
          <input
            className={inputCls}
            value={values.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="Optional — e.g. college students"
          />
        </Field>
        <Field label="Location">
          <input
            className={inputCls}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Optional — e.g. India"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={!canGenerate}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 disabled:opacity-50",
            generateStatus === "error" && "bg-destructive",
          )}
        >
          {generating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {buttonLabel}
        </button>
        {generating && (
          <button
            type="button"
            onClick={onCancelGenerate}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-accent"
          >
            <X className="size-3.5" aria-hidden /> Cancel
          </button>
        )}
        <button
          type="button"
          onClick={clearAll}
          disabled={generating}
          className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Enter one title and generate separate captions, descriptions, titles, keywords, and hashtag
        suggestions for every selected platform.
      </p>

      {steps.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-border bg-background/60 p-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2 text-xs">
              <StepIcon state={step.state} />
              <span
                className={cn(
                  step.state === "pending" && "text-muted-foreground",
                  step.state === "failed" && "text-destructive",
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Field label="Main caption" hint={`${values.caption.length}/2200 characters`}>
        <textarea
          className={cn(inputCls, "min-h-28 resize-y")}
          value={values.caption}
          onChange={(e) => set("caption", e.target.value.slice(0, 2200))}
          placeholder="Optional notes or a base caption"
        />
      </Field>

      <Field label="Description" hint={`${values.description.length}/5000 characters`}>
        <textarea
          className={cn(inputCls, "min-h-24 resize-y")}
          value={values.description}
          onChange={(e) => set("description", e.target.value.slice(0, 5000))}
          placeholder="Longer description used by YouTube and Pinterest"
        />
      </Field>

      <Field label="Hashtags" hint={`${hashtagCount}/30 hashtags`}>
        <input
          className={inputCls}
          value={values.hashtags}
          onChange={(e) => set("hashtags", e.target.value)}
          placeholder="#studio #bts #autumncapsule"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Destination link">
          <input
            className={inputCls}
            value={values.linkUrl}
            onChange={(e) => set("linkUrl", e.target.value)}
            placeholder="https://example.com/launch"
          />
        </Field>
        <Field label="Alternative text">
          <input
            className={inputCls}
            value={values.altText}
            onChange={(e) => set("altText", e.target.value)}
            placeholder="Describe the media for screen readers"
          />
        </Field>
      </div>

      <Field label="Schedule for later (optional)">
        <input
          type="datetime-local"
          className={inputCls}
          value={values.scheduledFor}
          onChange={(e) => {
            set("scheduledFor", e.target.value);
            onScheduleChange(e.target.value);
          }}
        />
      </Field>
    </section>
  );
});
