import type { ExperimentCardData } from "@/lib/db/views/experiments";
import { ciText, formatWhen, rateText } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RunExperimentButton } from "./run-experiment-button";

const STATUS = {
  measured: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  simulated: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  designed: "border-border bg-muted text-muted-foreground",
};
const VERDICT: Record<string, string> = {
  improved: "text-emerald-800 dark:text-emerald-300", met: "text-emerald-800 dark:text-emerald-300",
  worse: "text-red-700", missed: "text-red-700", no_difference: "text-amber-800 dark:text-amber-300",
  insufficient: "text-muted-foreground", not_run: "text-muted-foreground",
};

export function ExperimentCard({ card, llmMode }: { card: ExperimentCardData; llmMode: string }) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4" data-experiment={card.id} data-status={card.status}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold uppercase", STATUS[card.status])} data-testid="status">{card.status}</span>
      </header>
      <p className="text-sm"><b>Hypothesis:</b> {card.hypothesis}</p>
      <dl className="grid gap-1 text-sm sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">Baseline</dt><dd>{card.baseline}</dd>
        <dt className="text-muted-foreground">Method</dt><dd>{card.method}</dd>
        <dt className="text-muted-foreground">Data</dt><dd>{card.data}</dd>
        <dt className="text-muted-foreground">Pass bar</dt><dd>{card.passBar}</dd>
        {card.minSample && <><dt className="text-muted-foreground">Min. sample</dt><dd>{card.minSample}</dd></>}
        <dt className="text-muted-foreground">Pre-registered</dt><dd className="font-mono text-xs">{card.file}</dd>
      </dl>
      {card.labelsReviewed === false && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Labels in {card.labelsFile} were drafted by the coding agent and haven&apos;t been reviewed by a human yet. Treat results as provisional.
        </p>
      )}
      {card.status !== "designed" && <Results card={card} />}
      <footer className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        {card.run.kind === "offline" && card.run.experiments.map((e) => <RunExperimentButton key={e} name={e} label={card.lastRun ? "Re-run" : "Run now"} />)}
        {card.run.kind === "live" && <span>Runs from the terminal (paid model calls): <code className="rounded bg-muted px-1">{card.run.command}</code>{llmMode !== "live" && " · LLM_MODE is fixture here"}</span>}
        {card.id === "grounding" && <RunExperimentButton name="grounding_audit" label="Run judge audit" />}
        {card.run.kind === "none" && <span>{card.run.why}</span>}
        {card.lastRun && <span>Last run {formatWhen(card.lastRun)}{card.mode ? ` · ${card.mode} mode` : ""}{card.failures > 0 ? ` · ${card.failures} failed runs excluded` : ""}</span>}
      </footer>
    </article>
  );
}

function Results({ card }: { card: ExperimentCardData }) {
  return (
    <div className="space-y-2">
      {card.verdict && <p className={cn("text-sm font-medium", VERDICT[card.verdict.kind])} data-testid="verdict">{card.verdict.text}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {card.metrics.map((m) => (
          <div key={m.id} className="rounded-lg border p-2 text-sm" data-metric={m.id}>
            <p className="font-medium">{m.label}</p>
            {!m.result.breakdown?.length && (
              <p className={m.result.denominator === 0 ? "text-muted-foreground" : "tabular-nums"}>
                {m.result.denominator === 0 ? "Not run yet" : rateText(m.result.numerator / m.result.denominator, m.result.numerator, m.result.denominator)}
                {ciText(m.result.ci95, m.result.denominator) && <span className="ml-2 text-xs text-muted-foreground">{ciText(m.result.ci95, m.result.denominator)}</span>}
              </p>
            )}
            <ul className="mt-1 space-y-0.5 text-xs">
              {m.result.breakdown?.map((b) => (
                <li key={b.key} className="flex justify-between gap-2">
                  <span>{b.label.replace(/_/g, " ")}</span>
                  <span className="tabular-nums">{b.numerator}/{b.denominator}{b.denominator > 0 ? ` · ${Math.round((b.numerator / b.denominator) * 100)}%` : ""}{ciText(b.ci95, b.denominator) ? ` · ${ciText(b.ci95, b.denominator)}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
