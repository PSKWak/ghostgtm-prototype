import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { loadMetricRowDetails } from "@/lib/db/views/metric-rows";
import { rateText } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MetricRowsPage({ searchParams }: { searchParams: Promise<{ metric?: string; real?: string }> }) {
  const { metric = "", real } = await searchParams;
  const realOnly = real !== "0";
  const data = await loadMetricRowDetails(await getDb(), metric, realOnly);
  if (!data) return <p>Unknown metric. <Link className="text-primary" href="/evals">Back to Evals</Link></p>;
  const { def, result, details } = data;
  return (
    <div className="space-y-4">
      <Link className="text-sm text-primary hover:underline" href={`/evals?real=${realOnly ? 1 : 0}`}>← Evals Console</Link>
      <div>
        <h1 className="text-xl font-semibold">{def.label}: the rows behind the number</h1>
        <p className="text-sm text-muted-foreground">{def.question}</p>
        <p className="mt-2 text-sm"><b>Numerator:</b> {def.numerator} · <b>Denominator:</b> {def.denominator}</p>
        <p className="text-sm"><b>Result:</b> {rateText(result.value, result.numerator, result.denominator) ?? `${result.numerator}/${result.denominator} (below minimum sample)`} · {realOnly ? "real only" : "real + synthetic"}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm" data-testid="metric-rows">
          <thead className="border-b"><tr>{["Row", "Table", "What it is", "Data"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {details.length === 0 && <tr><td className="px-3 py-2" colSpan={4}>No rows.</td></tr>}
            {details.map((d) => (
              <tr key={`${d.table}-${d.id}`}>
                <td className="px-3 py-2 font-mono text-xs">{d.href ? <Link className="text-primary hover:underline" href={d.href}>{d.id}</Link> : d.id}</td>
                <td className="px-3 py-2 text-xs">{d.table}</td>
                <td className="px-3 py-2">{d.summary}</td>
                <td className="px-3 py-2 text-xs">{d.synthetic ? <span className="rounded border border-dashed px-1">synthetic</span> : "real"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
