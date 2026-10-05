import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { metricById } from "@/lib/metrics/definitions";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";

export type RowDetail = { id: string; table: string; summary: string; synthetic: boolean; href?: string };

// Resolves a metric's rowIds to readable rows, whichever table they came from.
export async function loadMetricRowDetails(db: Db, metricId: string, realOnly: boolean) {
  const def = metricById(metricId);
  if (!def) return null;
  const computed = computeMetrics(await loadMetricRows(db), realOnly).find((m) => m.def.id === metricId)!;
  const ids = computed.result.rowIds.map((id) => id.split("#")[0]!); // audit rows are per claim: draft#index
  const unique = [...new Set(ids)];
  const [decisions, executions, runs, replays, experiments, workflows] = unique.length === 0 ? [[], [], [], [], [], []] : await Promise.all([
    db.select().from(t.decisions).where(inArray(t.decisions.id, unique)),
    db.select().from(t.executions).where(inArray(t.executions.id, unique)),
    db.select().from(t.aiRuns).where(inArray(t.aiRuns.id, unique)),
    db.select().from(t.replayResults).where(inArray(t.replayResults.id, unique)),
    db.select().from(t.experimentRuns).where(inArray(t.experimentRuns.id, unique)),
    db.select().from(t.workflows).where(inArray(t.workflows.id, unique)),
  ]);
  const wfHref = (id: string) => `/slack?wf=${id}#${id}`;
  const details: RowDetail[] = [
    ...decisions.map((d) => ({ id: d.id, table: "decisions", synthetic: d.isSynthetic, href: d.isSynthetic ? undefined : wfHref(d.workflowId),
      summary: `${d.kind.replace(/_/g, " ")}${d.rejectReason ? ` (${d.rejectReason})` : ""} · reviewed ${(d.reviewMs / 1000).toFixed(1)}s · ${d.workflowId}` })),
    ...workflows.map((w) => ({ id: w.id, table: "workflows", synthetic: w.isSynthetic, href: w.isSynthetic ? undefined : wfHref(w.id), summary: `${w.state} · ${w.accountId}` })),
    ...executions.map((e) => ({ id: e.id, table: "executions", synthetic: false, href: wfHref(e.workflowId), summary: `${e.action} · ${e.status} · hash ${e.contentHash.slice(0, 10)}…` })),
    ...runs.map((r) => ({ id: r.id, table: "ai_runs", synthetic: r.isSynthetic, summary: `${r.task} ${r.promptVersion} · ${r.mode} · attempt ${r.attempt} · verify first try: ${r.verifyPassedFirstTry ?? "n/a"}` })),
    ...replays.map((r) => ({ id: r.id, table: "replay_results", synthetic: false, summary: `${r.testCaseId} · ${r.promptVersion} · ${r.passed ? "pass" : "fail"}` })),
    ...experiments.map((x) => ({ id: x.id, table: "experiment_runs", synthetic: x.isSynthetic, summary: `${x.experiment}/${x.arm} · case ${x.caseId} · ${JSON.stringify(x.result).slice(0, 140)}` })),
  ];
  return { def: { id: def.id, label: def.label, question: def.question, numerator: def.numerator, denominator: def.denominator }, result: computed.result, details };
}
