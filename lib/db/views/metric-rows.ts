import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { metricById } from "@/lib/metrics/definitions";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";
import { describeExperimentRow } from "./describe-experiment-row";

export type RowDetail = { id: string; table: string; summary: string; synthetic: boolean; href?: string; counted: boolean | null }; // counted: in the numerator? null = metric doesn't say

// One readable row for every row the metric counted, in the metric's own order, so
// the number of rows on the page always equals the metric's denominator. A row id
// like "xr_1#3" means item 3 inside experiment row xr_1 (one audited claim).
export async function loadMetricRowDetails(db: Db, metricId: string, realOnly: boolean) {
  const def = metricById(metricId);
  if (!def) return null;
  const computed = computeMetrics(await loadMetricRows(db), realOnly).find((m) => m.def.id === metricId)!;
  const baseIds = [...new Set(computed.result.rowIds.map((id) => id.split("#")[0]!))];
  const none = <T,>(): T[] => [];
  const [decisions, workflows, executions, runs, replays, experiments] = baseIds.length === 0
    ? [none<typeof t.decisions.$inferSelect>(), none<typeof t.workflows.$inferSelect>(), none<typeof t.executions.$inferSelect>(), none<typeof t.aiRuns.$inferSelect>(), none<typeof t.replayResults.$inferSelect>(), none<typeof t.experimentRuns.$inferSelect>()]
    : await Promise.all([
      db.select().from(t.decisions).where(inArray(t.decisions.id, baseIds)),
      db.select().from(t.workflows).where(inArray(t.workflows.id, baseIds)),
      db.select().from(t.executions).where(inArray(t.executions.id, baseIds)),
      db.select().from(t.aiRuns).where(inArray(t.aiRuns.id, baseIds)),
      db.select().from(t.replayResults).where(inArray(t.replayResults.id, baseIds)),
      db.select().from(t.experimentRuns).where(inArray(t.experimentRuns.id, baseIds)),
    ]);
  const wfHref = (id: string) => `/slack?wf=${id}#${id}`;
  const by = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const [D, W, E, R, P, X] = [by(decisions), by(workflows), by(executions), by(runs), by(replays), by(experiments)];

  const counted = new Set(computed.result.numeratorIds ?? []);
  const detail = (rowId: string): Omit<RowDetail, "counted"> => {
    const [id, index] = rowId.split("#") as [string, string | undefined];
    const d = D.get(id), w = W.get(id), e = E.get(id), r = R.get(id), p = P.get(id), x = X.get(id);
    if (d) return { id: rowId, table: "decisions", synthetic: d.isSynthetic, href: d.isSynthetic ? undefined : wfHref(d.workflowId), summary: `${d.kind.replace(/_/g, " ")}${d.rejectReason ? ` (${d.rejectReason.replace(/_/g, " ")})` : ""} · reviewed for ${(d.reviewMs / 1000).toFixed(1)}s · workflow ${d.workflowId}` };
    if (w) return { id: rowId, table: "workflows", synthetic: w.isSynthetic, href: w.isSynthetic ? undefined : wfHref(w.id), summary: `${w.state} · ${w.accountId} · prompt ${w.promptVersion}` };
    if (e) return { id: rowId, table: "executions", synthetic: false, href: wfHref(e.workflowId), summary: `${e.action.replace(/_/g, " ")} · ${e.status} · content hash ${e.contentHash.slice(0, 10)}…` };
    if (r) return { id: rowId, table: "ai_runs", synthetic: r.isSynthetic, summary: `${r.task} with ${r.promptVersion} · ${r.mode} · attempt ${r.attempt} · passed verify first try: ${r.verifyPassedFirstTry === null ? "n/a (a retry)" : r.verifyPassedFirstTry ? "yes" : "no"}` };
    if (p) return { id: rowId, table: "replay_results", synthetic: false, summary: `test ${p.testCaseId} · ${p.promptVersion} · ${p.passed ? "pass" : "fail"}` };
    if (x) return { id: rowId, table: "experiment_runs", synthetic: x.isSynthetic, summary: describeExperimentRow(x, index === undefined ? undefined : Number(index)) };
    return { id: rowId, table: "unknown", synthetic: false, summary: "row no longer exists" };
  };
  return {
    def: { id: def.id, label: def.label, question: def.question, numerator: def.numerator, denominator: def.denominator },
    result: computed.result,
    details: computed.result.rowIds.map((id) => ({ ...detail(id), counted: counted.size > 0 || computed.result.numeratorIds ? counted.has(id) : null })),
  };
}
