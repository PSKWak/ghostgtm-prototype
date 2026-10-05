import { classifyEdits, diffBody } from "@/lib/engine/diff";
import { proposeCorrections } from "@/lib/engine/proposals";
import { routeFeedback } from "@/lib/engine/routing";
import type { Draft } from "@/lib/engine/types";
import { loadFeedbackLabels } from "@/lib/evals/labels";
import { seedStanding, type ExperimentRowInput } from "@/lib/evals/seed-facts";
import { classifyLeftovers, type ClassifyRun } from "@/lib/llm/classify";
import type { ModelCall } from "@/lib/llm/model";

// Feedback learning: does taxonomy routing send each piece of feedback to the fix
// that addresses it, compared with sending everything to prompt review?

export type FeedbackDeps = { mode: "fixture" | "live"; callModel: ModelCall; onRun?: (run: ClassifyRun) => void };

type EditCase = Extract<ReturnType<typeof loadFeedbackLabels>["cases"][number], { kind: "edit" }>;

// The product's own pipeline, applied to one labeled edit.
async function classifyCase(c: EditCase, deps: FeedbackDeps) {
  const facts = seedStanding(c.accountId).facts;
  const draft: Draft = { subject: "", claims: [{ id: "c", sentence: c.before, factIds: c.claimFactIds, factual: true }] };
  const { classified, leftover } = classifyEdits(diffBody(draft, c.after), draft, facts);
  const proposalMade = proposeCorrections(classified, facts).proposals.length > 0;
  if (classified[0]) return { category: classified[0].category, method: "rule", proposalMade };
  const { labels, run } = await classifyLeftovers(leftover.slice(0, 1), deps);
  if (run) deps.onRun?.(run);
  return { category: labels[0]?.category ?? null, method: labels[0]?.method ?? null, proposalMade };
}

export async function runFeedback(deps: FeedbackDeps): Promise<ExperimentRowInput[]> {
  const rows: ExperimentRowInput[] = [];
  for (const c of loadFeedbackLabels().cases) {
    const expectedCategory = c.kind === "edit" ? c.expectedCategory : null;
    const base = { expectedRoute: c.expectedRoute, expectedCategory, proposalExpected: c.expectsProposal, mode: deps.mode };
    const row = (arm: string, result: object): ExperimentRowInput =>
      ({ experiment: "feedback", arm, caseId: c.id, runIndex: 0, promptVersion: null, isSynthetic: true, result: { ...base, ...result } });

    // Baseline: approve/reject only, every negative signal goes to prompt review.
    rows.push(row("baseline", { actualRoute: "prompt", actualCategory: null, method: null, proposalMade: false }));

    if (c.kind === "reject") {
      rows.push(row("method", { actualRoute: routeFeedback({ kind: "reject", reason: c.rejectReason }), actualCategory: null, method: null, proposalMade: false }));
      continue;
    }
    const got = await classifyCase(c, deps);
    rows.push(row("method", {
      actualRoute: got.category ? routeFeedback({ kind: "edit", category: got.category }) : "log",
      actualCategory: got.category, method: got.method, proposalMade: got.proposalMade,
    }));
  }
  return rows;
}
