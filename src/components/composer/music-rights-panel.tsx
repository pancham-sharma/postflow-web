import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/composer/audio-card";
import { platformMap } from "@/lib/postflow-data";
import {
  COPYRIGHT_DISCLAIMER,
  RISK_LABEL,
  RISK_TONE,
  type RightsCheck,
} from "@/lib/music";

/**
 * Pre-publish copyright risk summary. It reports what the licence data says —
 * it is not a legal guarantee, and the wording never promises one.
 */
export function MusicRightsPanel({ checks }: { checks: RightsCheck[] }) {
  const relevant = checks.filter((c) => c.usingMusic);
  if (relevant.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="inline-flex items-center gap-1.5 text-base font-semibold">
        <ShieldCheck className="size-4" aria-hidden /> Music rights check
      </h2>
      <ul className="space-y-2">
        {relevant.map((check) => (
          <li key={check.cardId} className="rounded-xl border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {platformMap[check.platform]?.name ?? check.platform} · {check.accountLabel}
              </span>
              <Badge label={RISK_LABEL[check.risk]} tone={RISK_TONE[check.risk]} />
              {check.trackTitle && (
                <span className="text-muted-foreground">“{check.trackTitle}”</span>
              )}
            </div>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {(
                [
                  ["Licence verified", check.licenceVerified],
                  ["Allowed on this platform", check.platformsConfirmed],
                  ["Commercial use allowed", check.commercialUseConfirmed],
                  ["Monetization allowed", check.monetizationConfirmed],
                  ["Attribution included", check.attributionIncluded],
                  ["Licence document on file", check.licenceDocumentAvailable],
                ] as const
              ).map(([label, ok]) => (
                <li key={label} className={ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}>
                  {ok ? "✓" : "!"} {label}
                </li>
              ))}
            </ul>
            {check.notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {check.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">{COPYRIGHT_DISCLAIMER}</p>
    </section>
  );
}