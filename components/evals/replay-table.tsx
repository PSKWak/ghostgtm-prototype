"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EvalsConsoleData } from "@/lib/db/views/evals";
import { formatWhen } from "@/lib/format";

// Test case × prompt version. A failure opens what the draft actually said next to
// what the test expected.
export function ReplayTable({ rows, versions }: { rows: EvalsConsoleData["replayTable"]; versions: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const res = await fetch("/api/evals/replay", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Replay failed");
    toast.success(`Replayed ${json.replayed} test × prompt combinations`);
    router.refresh();
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Replay ({rows.length} active tests)</h2>
        <Button size="sm" variant="outline" onClick={run} disabled={busy || rows.length === 0}>{busy ? "Replaying…" : "Replay all prompt versions"}</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm" data-testid="replay-table">
          <thead className="border-b"><tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Test</th>
            {versions.map((v) => <th key={v} className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">{v}</th>)}
          </tr></thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td className="px-3 py-2" colSpan={versions.length + 1}>No tests yet. Correct a fact in a draft, or turn an edit into a test case.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 align-top">{r.name}</td>
                {r.cells.map(({ version, cell }) => (
                  <td key={version} className="px-3 py-2 align-top">
                    {!cell ? <span className="text-muted-foreground">not run</span> : cell.passed ? (
                      <span className="font-medium text-emerald-700" title={formatWhen(cell.ranAt)}>pass</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer font-medium text-red-700">fail · diff</summary>
                        <div className="mt-1 space-y-1 text-xs">
                          <p><span className="text-muted-foreground">Expected a sentence containing:</span> <ins className="bg-emerald-100 no-underline dark:bg-emerald-950">{r.mustContain}</ins></p>
                          <p className="text-muted-foreground">The draft said:</p>
                          <ul className="ml-4 list-disc">{cell.sentences.map((s) => <li key={s}><del className="bg-red-50 no-underline dark:bg-red-950">{s}</del></li>)}</ul>
                          <p className="text-muted-foreground">{cell.reason}</p>
                        </div>
                      </details>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
