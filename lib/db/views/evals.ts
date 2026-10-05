import { asc, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { getActivePromptVersion } from "@/lib/db/settings";
import { PROMPT_VERSIONS } from "@/lib/llm/prompts";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";
import { FeedbackResult } from "@/lib/metrics/defs/experiments";
import { computeTrustLevel } from "@/lib/metrics/trust";
import type { MetricDef, MetricResult } from "@/lib/metrics/types";

// Everything the Evals Console renders, as plain data. The page computes nothing.

export type MetricCardData = { def: Omit<MetricDef, "compute">; result: MetricResult };
export type ReplayCell = { passed: boolean; reason: string; ranAt: string; sentences: string[] } | null;

export async function loadEvalsConsole(db: Db, realOnly: boolean) {
  const rows = await loadMetricRows(db);
  const metrics: MetricCardData[] = computeMetrics(rows, realOnly).map(({ def: { compute: _compute, ...def }, result }) => ({ def, result }));

  const tests = await db.select().from(t.testCases).where(isNull(t.testCases.retiredBy)).orderBy(asc(t.testCases.createdAt));
  const replays = await db.select().from(t.replayResults).orderBy(asc(t.replayResults.ranAt));
  const versions = [...new Set([...Object.keys(PROMPT_VERSIONS), ...replays.map((r) => r.promptVersion)])];
  const cell = (testId: string, version: string): ReplayCell => {
    const r = replays.filter((x) => x.testCaseId === testId && x.promptVersion === version).at(-1);
    if (!r) return null;
    const out = r.output as { reason?: string; draft?: { claims?: { sentence: string; factual: boolean }[] } } | null;
    return { passed: r.passed, reason: out?.reason ?? "", ranAt: r.ranAt.toISOString(), sentences: (out?.draft?.claims ?? []).filter((c) => c.factual).map((c) => c.sentence) };
  };
  const replayTable = tests.map((tc) => ({ id: tc.id, name: tc.name, mustContain: tc.expectation.mustContain, sourceDecisionId: tc.sourceDecisionId, cells: versions.map((v) => ({ version: v, cell: cell(tc.id, v) })) }));

  const misses = rows.experiments.filter((x) => x.experiment === "feedback" && x.arm === "method").flatMap((x) => {
    const p = FeedbackResult.safeParse(x.result);
    return p.success && p.data.expectedCategory && p.data.actualCategory !== p.data.expectedCategory
      ? [{ caseId: x.caseId, expected: p.data.expectedCategory, actual: p.data.actualCategory ?? "none", method: p.data.method ?? "–" }] : [];
  });

  return {
    realOnly, metrics, trust: computeTrustLevel(rows), replayTable, versions, misses,
    activePromptVersion: await getActivePromptVersion(db), promptVersions: Object.keys(PROMPT_VERSIONS),
  };
}

export type EvalsConsoleData = Awaited<ReturnType<typeof loadEvalsConsole>>;
