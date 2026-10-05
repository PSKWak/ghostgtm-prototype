import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { simulateExecution } from "@/lib/engine/execute";
import { hashDraft } from "@/lib/engine/hash";
import { transition } from "@/lib/engine/state-machine";
import { formatValue } from "@/lib/engine/templates";
import { fail, ok, type Result, type WorkflowState } from "@/lib/engine/types";
import { newId } from "./ids";
import { recordLearning } from "./learn";
import { describeProposal, planApproval, type ApprovalInput, type ApprovalPlan, type FactChange, type ProposalView } from "./review";
import { assessAllActions, strictest } from "./risk-input";

export type Problem = { claimId: string | null; sentence: string; reason: string };
export type ApproveOutcome =
  | { kind: "stale"; changes: FactChange[] }
  | { kind: "fix"; problems: Problem[] }
  | { kind: "confirm"; proposals: ProposalView[] }
  | { kind: "acknowledge"; challenged: FactChange[] }
  | { kind: "done"; workflowId: string; state: WorkflowState };

export type ApproveRequest = ApprovalInput & { confirmCorrections: boolean; acknowledgeChallenged?: boolean };
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Thrown inside the transaction so a half-written approval always rolls back.
class ApprovalAborted extends Error {}

function problemsOf(plan: ApprovalPlan): Problem[] {
  const sentence = (id: string | null) => plan.approved.claims.find((c) => c.id === id)?.sentence ?? "";
  const unverified = plan.verification.verdicts.filter((v) => v.label !== "supported")
    .filter((v) => !plan.unresolved.some((u) => u.claimId === v.claimId))
    .map((v) => ({ claimId: v.claimId, sentence: sentence(v.claimId), reason: v.label === "none" && v.reason === "no citation" ? "states something no fact on record backs" : "isn't backed by the record" }));
  return [...plan.unresolved.map((u) => ({ claimId: u.claimId, sentence: sentence(u.claimId), reason: u.reason })), ...unverified];
}

// What the rep must settle first, in order: a changed record, unbacked text, corrections, contradictions.
function nextQuestion(plan: ApprovalPlan, req: ApproveRequest): ApproveOutcome | null {
  if (plan.staleSince.length > 0) return { kind: "stale", changes: plan.staleSince };
  const problems = problemsOf(plan);
  if (problems.length > 0) return { kind: "fix", problems }; // rule 5
  if (plan.corrections.length > 0 && !req.confirmCorrections) {
    return { kind: "confirm", proposals: plan.corrections.map((c) => describeProposal(c.proposal, plan.ctx.standing.facts)) }; // rule 7
  }
  if (plan.challenged.length > 0 && !req.acknowledgeChallenged) return { kind: "acknowledge", challenged: plan.challenged };
  return null;
}

export async function approveWorkflow(db: Db, req: ApproveRequest): Promise<Result<ApproveOutcome>> {
  const planned = await planApproval(db, req);
  if (!planned.ok) return planned;
  const question = nextQuestion(planned.value, req);
  if (question) return ok(question);
  try {
    const state = await db.transaction((tx) => writeApproval(tx, planned.value, req));
    return ok({ kind: "done", workflowId: planned.value.workflow.id, state });
  } catch (e) {
    if (e instanceof ApprovalAborted) return fail(e.message);
    throw e;
  }
}

async function writeApproval(tx: Tx, plan: ApprovalPlan, req: ApproveRequest): Promise<WorkflowState> {
  // Claim the workflow atomically: a concurrent second approve finds nothing to claim.
  const claimed = await tx.update(t.workflows).set({ state: "approved" })
    .where(and(eq(t.workflows.id, plan.workflow.id), eq(t.workflows.state, "awaiting_approval"))).returning({ id: t.workflows.id });
  if (claimed.length === 0) throw new ApprovalAborted("this draft was already decided");

  const draftId = plan.changed ? newId("d") : plan.original.id;
  if (plan.changed) {
    await tx.insert(t.drafts).values({
      id: draftId, workflowId: plan.workflow.id, version: plan.original.version + 1, author: "rep",
      content: plan.approved, contentHash: hashDraft(plan.approved), verdicts: plan.verification.verdicts,
    });
  }
  await tx.insert(t.decisions).values({
    id: plan.decisionId, workflowId: plan.workflow.id, userId: req.userId,
    kind: plan.changed ? "approved_edited" : "approved_clean", approvedDraftId: draftId, reviewMs: plan.reviewMs,
  });
  await recordLearning(tx, plan, req.userId);

  // Rule 1: risk is checked again, now with the approval, right before anything runs.
  const risks = assessAllActions({ ...plan.ctx, standing: plan.standing }, plan.approved, plan.verification.verdicts, plan.workflow.recipientContactId, "approved");
  await tx.insert(t.riskChecks).values(risks.map(({ action, risk }) => ({
    id: newId("rk"), workflowId: plan.workflow.id, action, verdict: risk.verdict, rule: risk.rule, reason: risk.reason,
  })));
  let state = transition("approved", { type: "start_execution", approved: true, risk: strictest(risks) });
  if (!state.ok) throw new ApprovalAborted(state.reason);
  if (state.value === "executing") state = await execute(tx, plan, draftId, req.now);
  if (!state.ok) throw new ApprovalAborted(state.reason);
  await tx.update(t.workflows).set({ state: state.value }).where(eq(t.workflows.id, plan.workflow.id));
  return state.value;
}

async function execute(tx: Tx, plan: ApprovalPlan, draftId: string, now: string): Promise<Result<WorkflowState>> {
  const to = plan.ctx.contacts.find((c) => c.id === plan.workflow.recipientContactId)?.email ?? null;
  const raw = plan.standing.current.find((f) => f.key === "next_step")?.value;
  const runs = (["send_email", "log_crm_activity", "create_crm_task"] as const).map((action) =>
    simulateExecution(action, plan.approved, { to, nextStep: raw ? formatValue(raw) : null, now }));
  await tx.insert(t.executions).values(runs.map(({ record, payload }) => ({
    id: newId("ex"), workflowId: plan.workflow.id, draftId, ...record, payload,
  })));
  return transition("executing", {
    type: "executions_finished", executions: runs.map((r) => r.record),
    approvedHash: hashDraft(plan.approved), requiredActions: ["send_email", "log_crm_activity", "create_crm_task"],
  });
}
