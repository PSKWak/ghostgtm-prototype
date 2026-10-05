import type { MetricCardData } from "@/lib/db/views/evals";

// Confusion matrix (rows = expected label, columns = what the classifier said) and
// every miss, with the method that produced it.
export function ClassifierPanel({ metric, misses }: { metric: MetricCardData | undefined; misses: { caseId: string; expected: string; actual: string; method: string }[] }) {
  const m = metric?.result.matrix;
  if (!metric || !m || metric.result.denominator === 0) {
    return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No classifier results yet. Run the feedback experiment on /evals/experiments.</p>;
  }
  const used = m.labels.map((_, i) => i).filter((i) => m.counts[i]!.some((c) => c > 0) || m.counts.some((row) => row[i]! > 0));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="overflow-x-auto rounded-xl border bg-card p-3">
        <table className="text-xs" data-testid="confusion-matrix">
          <thead><tr><th className="p-1 text-left text-muted-foreground">expected ↓ / got →</th>{used.map((i) => <th key={i} className="p-1">{m.labels[i]!.replace(/_/g, " ")}</th>)}</tr></thead>
          <tbody>{used.map((r) => (
            <tr key={r}><th className="p-1 text-left font-medium">{m.labels[r]!.replace(/_/g, " ")}</th>
              {used.map((c) => <td key={c} className={`p-1 text-center tabular-nums ${r === c ? "font-semibold text-emerald-700" : m.counts[r]![c]! > 0 ? "font-semibold text-red-700" : "text-muted-foreground"}`}>{m.counts[r]![c]}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="rounded-xl border bg-card p-3 text-sm">
        <p className="mb-1 font-medium">Misses ({misses.length})</p>
        {misses.length === 0 ? <p className="text-muted-foreground">None.</p> : (
          <ul className="space-y-1">{misses.map((x) => <li key={x.caseId}><span className="font-mono text-xs">{x.caseId}</span>: expected <b>{x.expected.replace(/_/g, " ")}</b>, got <b>{x.actual.replace(/_/g, " ")}</b> <span className="text-muted-foreground">({x.method})</span></li>)}</ul>
        )}
      </div>
    </div>
  );
}
