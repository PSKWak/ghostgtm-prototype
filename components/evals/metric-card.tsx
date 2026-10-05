import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MetricCardData } from "@/lib/db/views/evals";
import { ciText, rateText } from "@/lib/format";

// Every number shows its value, numerator/denominator, interval, real/synthetic
// split, the rows behind it and the definition. A bare number is a bug.
export function MetricCard({ data, realOnly }: { data: MetricCardData; realOnly: boolean }) {
  const { def, result: r } = data;
  const enough = def.kind === "count" || r.value !== null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4" data-metric={def.id}>
      <div className="flex items-start justify-between gap-2">
        <Tooltip>
          <TooltipTrigger render={<h3 className="cursor-help text-sm font-medium underline decoration-dotted underline-offset-4" />}>{def.label}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-medium">{def.question}</p>
            <p className="mt-1"><b>Numerator:</b> {def.numerator}</p>
            <p><b>Denominator:</b> {def.denominator}</p>
            <p className="opacity-70">Shown once n ≥ {def.minSample}</p>
          </TooltipContent>
        </Tooltip>
        <Link className="shrink-0 text-xs text-primary hover:underline" href={`/evals/rows?metric=${def.id}&real=${realOnly ? 1 : 0}`}>Show rows</Link>
      </div>
      {enough ? (
        <p className="text-2xl font-semibold tabular-nums" data-testid={`metric-${def.id}`}>
          {def.kind === "count" ? `${r.numerator}` : rateText(r.value, r.numerator, r.denominator)}
          {def.kind === "count" && <span className="ml-1 text-sm font-normal text-muted-foreground">of {r.denominator} recent events</span>}
        </p>
      ) : (
        <p className="text-base font-medium text-muted-foreground" data-testid={`metric-${def.id}`}>Not enough data (n={r.denominator})</p>
      )}
      {def.kind === "rate" && ciText(r.ci95, r.denominator) && <p className="text-xs text-muted-foreground">{ciText(r.ci95, r.denominator)}</p>}
      <p className="text-xs text-muted-foreground">{r.realCount} real · {r.syntheticCount} synthetic</p>
      {r.breakdown && r.breakdown.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t pt-2 text-xs">
          {r.breakdown.map((b) => (
            <li key={b.key} className="flex justify-between gap-2">
              <span>{b.label}</span>
              <span className="tabular-nums text-muted-foreground">{def.kind === "count" ? b.numerator : `${b.numerator}/${b.denominator}`}{b.value !== null && def.kind === "rate" ? ` · ${Math.round(b.value * 100)}%` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
