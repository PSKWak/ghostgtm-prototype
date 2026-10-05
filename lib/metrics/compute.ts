import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { METRICS, onlyReal } from "./definitions";
import type { MetricDef, MetricResult, MetricRows } from "./types";

// Loads every row a metric can count, once. Definitions stay pure; this does the I/O.
export async function loadMetricRows(db: Db): Promise<MetricRows> {
  const [workflows, decisions, edits, executions, drafts, runs, replays, experiments] = await Promise.all([
    db.select().from(t.workflows), db.select().from(t.decisions), db.select().from(t.edits), db.select().from(t.executions),
    db.select({ id: t.drafts.id, contentHash: t.drafts.contentHash }).from(t.drafts),
    db.select().from(t.aiRuns).where(and(eq(t.aiRuns.task, "generate"), eq(t.aiRuns.attempt, 1))),
    db.select({ r: t.replayResults }).from(t.replayResults).innerJoin(t.testCases, eq(t.replayResults.testCaseId, t.testCases.id)).where(isNull(t.testCases.retiredBy)),
    db.select().from(t.experimentRuns),
  ]);
  const wf = new Map(workflows.map((w) => [w.id, w]));
  const hash = new Map(drafts.map((d) => [d.id, d.contentHash]));
  const approvedDraft = new Map(decisions.filter((d) => d.approvedDraftId).map((d) => [d.workflowId, d.approvedDraftId!]));
  return {
    decisions: decisions.map((d) => {
      const mine = edits.filter((e) => e.decisionId === d.id);
      return {
        id: d.id, workflowId: d.workflowId, kind: d.kind, rejectReason: d.rejectReason, reviewMs: d.reviewMs, decidedAt: d.decidedAt.toISOString(),
        isSynthetic: d.isSynthetic, workflowState: wf.get(d.workflowId)?.state ?? "created",
        editCategories: mine.flatMap((e) => (e.category ? [e.category] : [])), editSeverities: mine.flatMap((e) => (e.severity ? [e.severity] : [])),
      };
    }),
    blocks: workflows.filter((w) => w.state === "blocked").map((w) => ({ id: w.id, at: w.createdAt.toISOString(), isSynthetic: w.isSynthetic })),
    executions: executions.map((e) => ({
      id: e.id, workflowId: e.workflowId, isSynthetic: wf.get(e.workflowId)?.isSynthetic ?? false,
      hashMatches: e.contentHash === hash.get(approvedDraft.get(e.workflowId) ?? ""),
    })),
    generateRuns: runs.map((r) => ({ id: r.id, mode: r.mode, verifyPassedFirstTry: r.verifyPassedFirstTry, isSynthetic: r.isSynthetic })),
    replays: replays.map(({ r }) => ({ id: r.id, testCaseId: r.testCaseId, promptVersion: r.promptVersion, passed: r.passed, ranAt: r.ranAt.toISOString() })),
    experiments: experiments.map((x) => ({ id: x.id, experiment: x.experiment, arm: x.arm, caseId: x.caseId, isSynthetic: x.isSynthetic, result: x.result })),
  };
}

export type ComputedMetric = { def: MetricDef; result: MetricResult };

// Experiment rows are flagged synthetic by design (labeled test cases), so "real only"
// never applies to them; it applies to everything reps actually did.
export function computeMetrics(rows: MetricRows, realOnly: boolean): ComputedMetric[] {
  const live = realOnly ? onlyReal(rows) : rows;
  return METRICS.map((def) => ({ def, result: def.compute(def.source === "experiment" ? rows : live) }));
}

export async function rowsForIds(db: Db, ids: string[]) {
  if (ids.length === 0) return { decisions: [], workflows: [] };
  const decisions = await db.select().from(t.decisions).where(inArray(t.decisions.id, ids));
  return { decisions, workflows: await db.select().from(t.workflows).where(inArray(t.workflows.id, ids)) };
}
