import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { expectationFor } from "@/lib/engine/replay";
import { renderDraft } from "@/lib/engine/templates";
import { FOLLOW_UP_TEMPLATES } from "@/lib/llm/fixtures";
import type { EditLabel } from "@/lib/llm/classify";
import { llmMode } from "@/lib/llm/client";
import { newId } from "./ids";
import { replayActiveTests } from "./replay";
import type { ApprovalPlan } from "./review";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// A rep's edit (1) is stored as classified spans, (2) corrects the graph, and
// (3) becomes a regression test that is replayed against a fresh draft right away.
export async function recordLearning(tx: Tx, plan: ApprovalPlan, userId: string, leftoverLabels: EditLabel[]): Promise<void> {
  const edits = [
    ...plan.classified,
    ...plan.leftover.map((e, i) => {
      const l = leftoverLabels[i];
      return { ...e, category: l?.category ?? null, severity: l?.severity ?? null, method: l?.method ?? null, factId: null };
    }),
  ];
  if (edits.length > 0) {
    await tx.insert(t.edits).values(edits.map((e) => ({
      id: newId("ed"), decisionId: plan.decisionId, claimId: e.claimId, before: e.before, after: e.after,
      category: e.category, severity: e.severity, method: e.method, factId: e.factId,
    })));
  }
  if (plan.corrections.length === 0) return;

  for (const { proposal, newFact } of plan.corrections) {
    await tx.insert(t.facts).values({ ...newFact, observedAt: new Date(newFact.observedAt), confirmedBy: userId });
    await tx.insert(t.proposals).values({
      id: newId("pr"), decisionId: plan.decisionId, accountId: plan.workflow.accountId, factKey: proposal.factKey,
      currentFactId: proposal.currentFactId, proposedValue: proposal.proposedValue, status: "confirmed", resolvedBy: userId,
    });
  }
  // Rule 6: losers stay, with superseded_by and a reason, recomputed by the same ranking.
  for (const f of plan.standing.facts) {
    await tx.update(t.facts).set({ supersededBy: f.supersededBy, supersededReason: f.supersededReason }).where(eq(t.facts.id, f.id));
  }
  await addRegressionTests(tx, plan);
}

async function addRegressionTests(tx: Tx, plan: ApprovalPlan): Promise<void> {
  const accountId = plan.workflow.accountId;
  const active = await tx.select().from(t.testCases).where(and(eq(t.testCases.accountId, accountId), isNull(t.testCases.retiredBy)));
  for (const { proposal } of plan.corrections) {
    const expectation = expectationFor(proposal.factKey, proposal.proposedValue);
    const id = newId("tc");
    await tx.insert(t.testCases).values({
      id, sourceDecisionId: plan.decisionId, accountId,
      name: `Follow-up states ${proposal.factKey.replace(/_/g, " ")} as ${expectation.mustContain}`, expectation,
    });
    // The fact moved on again: the older test describes a value that is no longer true.
    for (const old of active.filter((x) => x.expectation.factKey === proposal.factKey)) {
      await tx.update(t.testCases).set({ retiredBy: id }).where(eq(t.testCases.id, old.id));
    }
  }
  // Checked right away against the grounded template. In live mode that is a proxy
  // (labelled so), and the real prompt is replayed on the next generated draft.
  const template = FOLLOW_UP_TEMPLATES[accountId];
  const label = llmMode() === "fixture" ? plan.workflow.promptVersion : "template-proxy";
  if (template) await replayActiveTests(tx, accountId, renderDraft(template, plan.standing.current), label);
}
