import { memo, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Save, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/form-styles";
import {
  CARD_FIELDS,
  CARD_LISTS,
  IMPROVE_LABELS,
  PLATFORM_META,
  cardToText,
  type CardFieldKey,
  type GeneratedPlatformCard,
  type ImproveAction,
  type ListFieldKey,
} from "@/lib/title-generator";

const btnCls =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";

const TEXT_ACTIONS: ImproveAction[] = [
  "improve_title",
  "improve_caption",
  "better_hook",
  "seo_version",
  "viral_version",
  "professional_version",
  "translate",
  "shorten",
  "expand",
  "rewrite",
];
const LIST_ACTIONS: ImproveAction[] = ["more_hashtags", "seo_version", "rewrite", "translate"];

function ImproveMenu({
  actions,
  busy,
  onPick,
}: {
  actions: ImproveAction[];
  busy: boolean;
  onPick: (action: ImproveAction) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">AI improve this field</span>
      {busy && (
        <Loader2 className="pointer-events-none absolute left-2 size-3 animate-spin" aria-hidden />
      )}
      <select
        value=""
        disabled={busy}
        aria-label="AI improve this field"
        onChange={(event) => {
          const action = event.target.value as ImproveAction;
          if (action) onPick(action);
        }}
        className="h-7 max-w-40 rounded-md border border-border bg-background py-1 pl-2 pr-7 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:pl-7 disabled:opacity-50"
      >
        <option value="">AI improve…</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {IMPROVE_LABELS[action]}
          </option>
        ))}
      </select>
    </label>
  );
}

export type GeneratorCardProps = {
  card: GeneratedPlatformCard;
  editing: boolean;
  regenerating: boolean;
  busyField: string | null;
  onToggleEdit: () => void;
  onChange: (patch: Partial<GeneratedPlatformCard>) => void;
  onRegenerate: () => void;
  onSave: () => void;
  onImprove: (args: {
    field: CardFieldKey | ListFieldKey;
    label: string;
    isList: boolean;
    maxChars: number | null;
    action: ImproveAction;
  }) => void;
};

export const GeneratorCard = memo(function GeneratorCard({
  card,
  editing,
  regenerating,
  busyField,
  onToggleEdit,
  onChange,
  onRegenerate,
  onSave,
  onImprove,
}: GeneratorCardProps) {
  const [copied, setCopied] = useState(false);
  const meta = PLATFORM_META[card.platform];
  const Icon = meta.icon;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cardToText(card));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard is blocked in this browser.");
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{meta.name}</h3>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={copy} className={btnCls} aria-label={`Copy ${meta.name} content`}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className={btnCls}
            aria-label={`Regenerate ${meta.name} content`}
          >
            {regenerating ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            Regenerate
          </button>
          <button type="button" onClick={onToggleEdit} className={btnCls}>
            <Pencil className="size-3.5" aria-hidden />
            {editing ? "Done" : "Edit"}
          </button>
          <button type="button" onClick={onSave} className={btnCls}>
            <Save className="size-3.5" aria-hidden />
            Save
          </button>
        </div>
      </header>

      <div className="grid gap-3">
        {CARD_FIELDS[card.platform].map((field) => {
          const value = card[field.key];
          const over = field.max !== undefined && value.length > field.max;
          const busy = busyField === field.key;
          return (
            <div key={field.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {field.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] tabular-nums text-muted-foreground", over && "text-destructive")}>
                    {value.length}
                    {field.max ? `/${field.max}` : ""}
                  </span>
                  <ImproveMenu
                    actions={TEXT_ACTIONS}
                    busy={busy}
                    onPick={(action) =>
                      onImprove({
                        field: field.key,
                        label: field.label,
                        isList: false,
                        maxChars: field.max ?? null,
                        action,
                      })
                    }
                  />
                </div>
              </div>
              {editing ? (
                field.kind === "textarea" ? (
                  <textarea
                    value={value}
                    onChange={(e) => onChange({ [field.key]: e.target.value } as Partial<GeneratedPlatformCard>)}
                    className={cn(inputCls, "min-h-24 resize-y")}
                  />
                ) : (
                  <input
                    value={value}
                    onChange={(e) => onChange({ [field.key]: e.target.value } as Partial<GeneratedPlatformCard>)}
                    className={inputCls}
                  />
                )
              ) : (
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {value || <span className="text-muted-foreground">—</span>}
                </p>
              )}
            </div>
          );
        })}

        {CARD_LISTS[card.platform].map((listDef) => {
          const values = card[listDef.key];
          const busy = busyField === listDef.key;
          return (
            <div key={listDef.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {listDef.label}
                  {listDef.hint && (
                    <span className="ml-2 font-medium normal-case tracking-normal">{listDef.hint}</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{values.length}</span>
                  <ImproveMenu
                    actions={LIST_ACTIONS}
                    busy={busy}
                    onPick={(action) =>
                      onImprove({
                        field: listDef.key,
                        label: listDef.label,
                        isList: true,
                        maxChars: null,
                        action,
                      })
                    }
                  />
                </div>
              </div>
              {editing ? (
                <textarea
                  value={values.join(" ")}
                  onChange={(e) =>
                    onChange({
                      [listDef.key]: e.target.value.split(/[\s,]+/).filter(Boolean),
                    } as Partial<GeneratedPlatformCard>)
                  }
                  className={cn(inputCls, "min-h-20 resize-y")}
                />
              ) : values.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {values.map((v) => (
                    <li
                      key={v}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground"
                    >
                      {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
});
