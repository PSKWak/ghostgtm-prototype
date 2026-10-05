import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { classifyEdits, diffBody, type ClassifiedEdit, type EditSpan } from "@/lib/engine/diff";
import { applyClaimEdits, reciteClaims, type ClaimEdit } from "@/lib/engine/draft-edit";
import { hashDraft, renderBody } from "@/lib/engine/hash";
import { applyCorrection, proposeCorrections, type FactProposal, type Unresolved } from "@/lib/engine/proposals";
import type { Standing } from "@/lib/engine/standing";
import { formatValue } from "@/lib/engine/templates";
import { fail, ok, type Draft, type Fact, type Result } from "@/lib/engine/types";
import { verifyDraft, type Verification } from "@/lib/engine/verify";
import { factLabel } from "@/lib/format";
import { loadAccountContext, type AccountContext } from "./context";
import { newId } from "./ids";

// Everything an approval will write, computed in memory first so the rep can be
// asked to confirm, fix or acknowledge before anything is stored.

export type ApprovalInput = { workflowId: string; userId: string; reviewMs: number; claimEdits: ClaimEdit[]; now: string };
export type Correction = { proposal: FactProposal; newFact: Fact };
export type FactChange = { factKey: string; label: string; from: string; to: string };
export type ApprovalPlan = {
  workflow: typeof t.workflows.$inferSelect;
  original: typeof t.drafts.$inferSelect;
  ctx: AccountContext;
  decisionId: string;
  reviewMs: number;
  approved: Draft;
  changed: boolean;
  classified: ClassifiedEdit[];
  leftover: EditSpan[];
  unresolved: Unresolved[];
  corrections: Correction[];
  standing: Standing; // after corrections
  verification: Verification;
  staleSince: FactChange[]; // facts the draft cited that a later decision replaced
  challenged: FactChange[]; // cited facts newer evidence contradicts, left as they were
};
export type ProposalView = FactChange;

const show = (v: string | null | undefined) => (v ? formatValue(v) : "unknown");

export function describeProposal(p: FactProposal, facts: Fact[]): ProposalView {
  const from = facts.find((f) => f.id === p.currentFactId)?.value;
  return { factKey: p.factKey, label: factLabel(p.factKey), from: show(from), to: show(p.proposedValue) };
}

function applyAll(proposals: FactProposal[], start: Standing, input: ApprovalInput, decisionId: string): Result<{ corrections: Correction[]; standing: Standing }> {
  let standing = start;
  const corrections: Correction[] = [];
  for (const proposal of proposals) {
    const r = applyCorrection(standing.facts, proposal, { userId: input.userId, decisionId, now: input.now });
    if (!r.ok) return r;
    corrections.push({ proposal, newFact: r.value.newFact });
    standing = r.value.standing;
  }
  return ok({ corrections, standing });
}

function factChanges(ids: string[], standing: Standing, pick: (f: Fact) => Fact | undefined): FactChange[] {
  return [...new Set(ids)].flatMap((id) => {
    const f = standing.facts.find((x) => x.id === id);
    const other = f && pick(f);
    return f && other ? [{ factKey: f.key, label: factLabel(f.key), from: show(f.value), to: show(other.value) }] : [];
  });
}

export async function planApproval(db: Db, input: ApprovalInput): Promise<Result<ApprovalPlan>> {
  const [workflow] = await db.select().from(t.workflows).where(eq(t.workflows.id, input.workflowId));
  if (!workflow) return fail(`unknown workflow ${input.workflowId}`);
  if (workflow.state !== "awaiting_approval") return fail(`workflow is ${workflow.state}, not awaiting approval`);
  const [original] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, workflow.id)).orderBy(desc(t.drafts.version)).limit(1);
  if (!original) return fail("workflow has no draft");
  const ctx = await loadAccountContext(db, workflow.accountId);
  if (!ctx.ok) return ctx;
  const edited = applyClaimEdits(original.content, input.claimEdits);
  if (!edited.ok) return edited;

  const decisionId = newId("dec");
  const facts = ctx.value.standing.facts;
  const byId = (id: string | null) => facts.find((f) => f.id === id);
  const cited = original.content.claims.flatMap((c) => c.factIds);
  const staleSince = factChanges(cited, ctx.value.standing, (f) => (f.supersededBy ? byId(f.supersededBy) : undefined));

  const changed = hashDraft(edited.value) !== original.contentHash;
  const { classified, leftover } = changed
    ? classifyEdits(diffBody(original.content, renderBody(edited.value)), original.content, facts)
    : { classified: [], leftover: [] };
  const { proposals, unresolved } = proposeCorrections(classified, facts);
  const applied = applyAll(proposals, ctx.value.standing, input, decisionId);
  if (!applied.ok) return applied;
  const { corrections, standing } = applied.value;
  const approved = reciteClaims(edited.value, new Map(corrections.map((c) => [c.proposal.currentFactId, c.newFact.id])));
  const challengedIds = approved.claims.flatMap((c) => c.factIds).filter((id) => standing.challenged.some((x) => x.factId === id));
  const challenged = factChanges(challengedIds, standing, (f) => byId(standing.challenged.find((x) => x.factId === f.id)?.byFactIds[0] ?? null));

  // Review time comes from the browser; it can never exceed how long the draft has existed.
  const reviewMs = Math.max(0, Math.min(input.reviewMs, Date.parse(input.now) - workflow.createdAt.getTime()));
  return ok({
    workflow, original, ctx: ctx.value, decisionId, reviewMs, approved, changed, classified, leftover, unresolved,
    corrections, standing, verification: verifyDraft(approved, standing.facts), staleSince, challenged,
  });
}
