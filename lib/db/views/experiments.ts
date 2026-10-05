import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { EXPERIMENT_CARDS, type ExperimentCardDef } from "@/lib/evals/experiments/registry";
import { labelsReviewed } from "@/lib/evals/labels";
import { autonomyVerdict, compareArms, type BarVerdict, type Verdict } from "@/lib/evals/verdict";
import { llmMode } from "@/lib/llm/client";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";
import type { MetricResult } from "@/lib/metrics/types";

export type ExperimentCardData = ExperimentCardDef & {
  metrics: { id: string; label: string; result: MetricResult }[];
  verdict: Verdict | BarVerdict | null;
  lastRun: string | null;
  failures: number;
  labelsReviewed: boolean | null;
  mode: string | null; // fixture or live, as recorded by the run
};

const CARD_METRICS: Record<string, string[]> = {
  grounding: ["unsupported_claim_rate", "judge_agreement"],
  feedback: ["routing_accuracy", "proposal_accuracy", "classifier_accuracy"],
  autonomy: ["human_burden", "critical_auto_executed"],
};

export async function loadExperimentCards(db: Db) {
  const computed = computeMetrics(await loadMetricRows(db), false);
  const reviewed = labelsReviewed();
  const cards: ExperimentCardData[] = [];
  for (const card of EXPERIMENT_CARDS) {
    const metrics = (CARD_METRICS[card.id] ?? []).map((id) => {
      const m = computed.find((c) => c.def.id === id)!;
      return { id, label: m.def.label, result: m.result };
    });
    const rows = card.run.kind === "none" ? [] : await db.select().from(t.experimentRuns).where(eq(t.experimentRuns.experiment, card.id));
    const arm = (metric: string, key: string) => metrics.find((m) => m.id === metric)?.result.breakdown?.find((b) => b.key === key);
    // Designed cards show hypothesis, metric and minimum sample, never a result.
    const verdict = card.status === "designed" ? null
      : card.id === "autonomy" ? autonomyVerdict(metrics[0]?.result.breakdown, metrics[1]?.result.breakdown)
      : card.id === "grounding" ? compareArms(arm("unsupported_claim_rate", "method"), arm("unsupported_claim_rate", "baseline"), false)
      : compareArms(arm("routing_accuracy", "method"), arm("routing_accuracy", "baseline"), true);
    cards.push({
      ...card, metrics: card.status === "designed" ? [] : metrics, verdict,
      lastRun: rows.length > 0 ? rows.map((r) => r.createdAt.toISOString()).sort().at(-1)! : null,
      failures: rows.filter((r) => (r.result as { failed?: boolean }).failed === true).length,
      labelsReviewed: card.labelsFile ? reviewed[card.labelsFile] ?? false : null,
      mode: (rows[0]?.result as { mode?: string } | undefined)?.mode ?? (card.id === "grounding" && rows.length > 0 ? "live" : null),
    });
  }
  return { cards, llmMode: llmMode() };
}
