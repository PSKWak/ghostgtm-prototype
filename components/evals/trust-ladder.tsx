import { CheckCircle2, XCircle } from "lucide-react";
import type { Trust } from "@/lib/metrics/trust";

// The level, every gate with required vs actual, and the event that cost a level.
export function TrustLadder({ trust }: { trust: Trust }) {
  const levels = [...new Set(trust.gates.map((g) => g.level))].sort();
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="trust-ladder">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Trust level {trust.level}: {trust.name}</h2>
        <span className="text-xs text-muted-foreground">Real decisions only</span>
      </div>
      <p className="text-sm text-muted-foreground">{trust.unlocks} Every action still needs a rep&apos;s approval in this prototype.</p>
      {trust.drop && trust.earned > trust.level && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="trust-drop">
          Dropped from level {trust.earned} to {trust.level}: {trust.drop.reason} on {trust.drop.workflowId}.
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {levels.map((lvl) => (
          <div key={lvl}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">To reach level {lvl}</p>
            <ul className="space-y-1 text-sm">
              {trust.gates.filter((g) => g.level === lvl).map((g) => (
                <li key={g.label} className="flex items-start gap-1.5">
                  {g.pass ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="passes" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="fails" />}
                  <span>{g.label}: <b className="tabular-nums">{g.actual}</b> <span className="text-muted-foreground">(needs {g.required})</span>{g.detail && <span className="block text-xs text-red-700">{g.detail}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
