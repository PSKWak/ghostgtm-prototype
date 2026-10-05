import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { loadWorkflowViews } from "@/lib/db/views/workflows";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const td = "px-3 py-2 align-top";
const wfLink = (id: string, text: string = id) => (
  <Link className="font-mono text-xs text-primary hover:underline" href={`/slack?wf=${id}#${id}`}>{text}</Link>
);

// Raw rows only. Rates with denominators and the trust ladder arrive with the metrics registry (Phase 6).
export default async function Evals() {
  const views = await loadWorkflowViews(await getDb());
  const decided = views.filter((w) => w.decision || w.state === "blocked" || w.state === "expired");
  const edits = views.flatMap((w) => w.edits.map((e, i) => ({ w, e, i })));
  const tests = views.flatMap((w) => w.tests.map((x) => ({ w, x })));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">What Ghost learned</h1>
        <p className="text-sm text-muted-foreground">Every decision, edit and regression test, linked to the workflow that produced it.</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Decision log ({decided.length})</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm" data-testid="decision-log">
            <thead className="border-b"><tr><th className={th}>Workflow</th><th className={th}>Account</th><th className={th}>Outcome</th><th className={th}>Review time</th><th className={th}>Edits</th></tr></thead>
            <tbody className="divide-y">
              {decided.map((w) => (
                <tr key={w.id}>
                  <td className={td}>{wfLink(w.id)}</td>
                  <td className={td}>{w.accountName}</td>
                  <td className={td}>
                    {w.decision
                      ? `${w.decision.kind.replace(/_/g, " ")}${w.decision.rejectReason ? `: ${w.decision.rejectReason.replace(/_/g, " ")}` : ""}${w.decision.rejectFact ? ` (${w.decision.rejectFact})` : ""}`
                      : w.state === "expired" ? "expired: record changed, redrafted" : "held by the shield"}
                  </td>
                  <td className={td}>{w.decision ? `${(w.decision.reviewMs / 1000).toFixed(1)}s` : "–"}</td>
                  <td className={td}>{w.edits.length}</td>
                </tr>
              ))}
              {decided.length === 0 && <tr><td className={td} colSpan={5}>No decisions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Edits ({edits.length})</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b"><tr><th className={th}>Before</th><th className={th}>After</th><th className={th}>Category</th><th className={th}>Severity</th><th className={th}>Workflow</th></tr></thead>
            <tbody className="divide-y">
              {edits.map(({ w, e, i }) => (
                <tr key={`${w.id}-${i}`}>
                  <td className={`${td} text-red-700 line-through dark:text-red-400`}>{e.before || "–"}</td>
                  <td className={`${td} text-emerald-700 dark:text-emerald-400`}>{e.after || "–"}</td>
                  <td className={td}>{e.category?.replace(/_/g, " ") ?? <span className="text-muted-foreground">awaiting LLM pass</span>}</td>
                  <td className={td}>{e.severity ?? "–"}</td>
                  <td className={td}>{wfLink(w.id)}</td>
                </tr>
              ))}
              {edits.length === 0 && <tr><td className={td} colSpan={5}>No edits yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Regression tests ({tests.length})</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm" data-testid="regression-tests">
            <thead className="border-b"><tr><th className={th}>Test</th><th className={th}>generate@v1</th><th className={th}>Why</th><th className={th}>Created from</th></tr></thead>
            <tbody className="divide-y">
              {tests.map(({ w, x }) => (
                <tr key={`${w.id}-${x.name}`}>
                  <td className={td}>{x.name}</td>
                  <td className={td}>
                    {x.retired ? <span className="text-muted-foreground">retired (newer correction)</span>
                      : x.passed ? <span className="font-medium text-emerald-700">pass</span> : <span className="font-medium text-red-700">fail</span>}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{x.reason}</td>
                  <td className={td}>{wfLink(w.id, `${w.decision?.userName ?? "rep"}'s edit on ${w.id}`)}</td>
                </tr>
              ))}
              {tests.length === 0 && <tr><td className={td} colSpan={4}>Correct a fact in a draft to create the first test.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
