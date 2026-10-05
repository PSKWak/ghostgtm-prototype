import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { fail, ok, type Result } from "@/lib/engine/types";
import { newId } from "@/lib/flow/ids";
import { llmMode } from "@/lib/llm/client";
import { callLiveModel, type ModelCall } from "@/lib/llm/model";
import { runAutonomy } from "./experiments/autonomy";
import { runFeedback } from "./experiments/feedback";
import { runGrounding } from "./experiments/grounding";
import { runGroundingAudit } from "./experiments/grounding-audit";
import type { ExperimentRowInput } from "./seed-facts";

export const RUNNABLE = ["grounding", "grounding_audit", "feedback", "autonomy"] as const;
export type RunnableExperiment = (typeof RUNNABLE)[number];

type AiRunRow = typeof t.aiRuns.$inferInsert;

// Runs one experiment and replaces its previous rows, so results never mix two runs.
// Results then come only from experiment_runs, through the metric registry.
export async function runExperiment(db: Db, name: RunnableExperiment, opts: { callModel?: ModelCall; runsPerAccount?: number } = {}): Promise<Result<{ rows: number }>> {
  const mode = llmMode();
  const callModel = opts.callModel ?? callLiveModel;
  const aiRuns: AiRunRow[] = [];
  let rows: ExperimentRowInput[];
  if (name === "autonomy") rows = runAutonomy();
  else if (name === "grounding_audit") rows = runGroundingAudit();
  else if (name === "feedback") {
    rows = await runFeedback({ mode, callModel, onRun: (r) => aiRuns.push({
      id: newId("run"), task: "classify_edit", promptVersion: r.promptVersion, model: r.model, mode: "live",
      input: { purpose: "experiment:feedback" }, output: (r.output ?? null) as object | null, parseOk: r.parseOk, latencyMs: r.latencyMs, isSynthetic: true,
    }) });
  } else {
    const g = await runGrounding({ mode, callModel, onAttempt: (a, accountId) => aiRuns.push({
      id: newId("run"), task: "generate", promptVersion: a.promptVersion, model: a.model, mode: "live",
      input: { accountId, purpose: "experiment:grounding" }, output: (a.output ?? null) as object | null, parseOk: a.parseOk, attempt: a.attempt, latencyMs: a.latencyMs,
    }) }, opts.runsPerAccount);
    if (!g.ok) return fail(g.reason);
    rows = g.value;
  }
  await db.transaction(async (tx) => {
    await tx.delete(t.experimentRuns).where(eq(t.experimentRuns.experiment, name));
    if (rows.length > 0) await tx.insert(t.experimentRuns).values(rows.map((r) => ({ id: newId("xr"), ...r })));
    if (aiRuns.length > 0) await tx.insert(t.aiRuns).values(aiRuns);
  });
  return ok({ rows: rows.length });
}
