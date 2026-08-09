import { useState } from "react";
import { cn } from "@/lib/utils";

export type ConflictTarget = { id: string; label: string };

/**
 * Asks before overwriting manually edited platform cards. The user can keep or
 * replace each card individually, replace everything, or cancel.
 */
export function ReplaceContentDialog({
  conflicts,
  onCancel,
  onConfirm,
}: {
  conflicts: ConflictTarget[];
  onCancel: () => void;
  onConfirm: (replaceIds: string[]) => void;
}) {
  const [replace, setReplace] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(conflicts.map((c) => [c.id, true])),
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Replace existing platform content"
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-lg"
      >
        <h2 className="text-base font-semibold">
          These platforms already contain content. Replace them with the newly generated version?
        </h2>
        <ul className="mt-4 space-y-2">
          {conflicts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
              <div className="flex gap-1">
                {(
                  [
                    ["Replace", true],
                    ["Keep existing", false],
                  ] as const
                ).map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReplace((prev) => ({ ...prev, [c.id]: value }))}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-semibold",
                      replace[c.id] === value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(conflicts.filter((c) => replace[c.id]).map((c) => c.id))}
            className="rounded-md border border-primary/60 px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => onConfirm(conflicts.map((c) => c.id))}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            Replace all
          </button>
        </div>
      </div>
    </div>
  );
}
