import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { toFact } from "@/lib/db/mappers";
import * as t from "@/lib/db/schema";
import type { ExecutionPayload } from "@/lib/engine/execute";
import { computeJourney, type JourneyStep } from "@/lib/engine/journey";
import { formatValue } from "@/lib/engine/templates";
import type { ActionKind, Fact, RiskVerdict, SupportLabel } from "@/lib/engine/types";
import { isCommercial } from "@/lib/engine/commercial";
import { routeFeedback } from "@/lib/engine/routing";
import { explainRisk, type RiskExplanation } from "@/lib/flow/explain";
import { strictest } from "@/lib/flow/risk-input";
import { factLabel } from "@/lib/format";

// Everything a view needs about a workflow, computed from rows. Views only render it.

export type Citation = { factId: string; factKey: string; label: string; value: string; source: Fact["source"]; sourceRef: string; observedAt: string };
export type ClaimView = { id: string; sentence: string; factual: boolean; label: SupportLabel | null; reason: string | null; citations: Citation[] };
export type WorkflowView = {
  id: string; accountId: string; accountName: string; state: string; createdAt: string;
  recipient: { name: string; email: string; title: string } | null;
  subject: string; claims: ClaimView[]; agentClaims: ClaimView[]; editedByRep: boolean;
  insight: string | null;
  generation: { mode: string; attempts: number; promptVersion: string; model: string } | null; // how the draft was produced
  risk: RiskExplanation & { verdict: RiskVerdict };
  decision: { kind: string; rejectReason: string | null; rejectFact: string | null; reviewMs: number; userName: string; decidedAt: string } | null;
  staleChanges: { label: string; from: string; to: string }[]; // pending draft the record has moved past
  heldSentences: string[]; // what the shield held, so the redraft can say what it leaves out
  removedSentences: string[]; // agent sentences the rep cleared
  edits: { id: string; before: string; after: string; category: string | null; severity: string | null; method: string | null; route: string | null }[];
  corrections: { label: string; from: string; to: string }[];
  tests: { name: string; passed: boolean; reason: string; retired: boolean }[];
  executions: { action: ActionKind; payload: ExecutionPayload; hashMatches: boolean; executedAt: string }[];
  journey: JourneyStep[];
};

const citation = (f: Fact): Citation => ({
  factId: f.id, factKey: f.key, label: factLabel(f.key), value: formatValue(f.value ?? "unknown"),
  source: f.source, sourceRef: f.sourceRef, observedAt: f.observedAt.slice(0, 10),
});

function claimViews(draft: typeof t.drafts.$inferSelect, facts: Map<string, Fact>): ClaimView[] {
  return draft.content.claims.map((c) => {
    const v = draft.verdicts?.find((x) => x.claimId === c.id);
    const cited = c.factIds.map((id) => facts.get(id)).filter((f): f is Fact => f !== undefined);
    return { id: c.id, sentence: c.sentence, factual: c.factual, label: v?.label ?? null, reason: v?.reason ?? null, citations: cited.map(citation) };
  });
}

export async function loadWorkflowViews(db: Db, filter: { accountId?: string } = {}): Promise<WorkflowView[]> {
  // Synthetic history is eval data, never shown as work in Slack, CRM or the workspace (rule 10).
  const wfs = await db.select().from(t.workflows)
    .where(and(eq(t.workflows.isSynthetic, false), filter.accountId ? eq(t.workflows.accountId, filter.accountId) : undefined))
    .orderBy(desc(t.workflows.createdAt));
  if (wfs.length === 0) return [];
  const ids = wfs.map((w) => w.id);
  const [accounts, contacts, users, drafts, risks, decisions, executions, facts, runs] = await Promise.all([
    db.select().from(t.accounts), db.select().from(t.contacts), db.select().from(t.users),
    db.select().from(t.drafts).where(inArray(t.drafts.workflowId, ids)),
    db.select().from(t.riskChecks).where(inArray(t.riskChecks.workflowId, ids)),
    db.select().from(t.decisions).where(inArray(t.decisions.workflowId, ids)),
    db.select().from(t.executions).where(inArray(t.executions.workflowId, ids)),
    db.select().from(t.facts),
    db.select({ workflowId: t.aiRuns.workflowId, mode: t.aiRuns.mode, attempt: t.aiRuns.attempt, promptVersion: t.aiRuns.promptVersion, model: t.aiRuns.model })
      .from(t.aiRuns).where(inArray(t.aiRuns.workflowId, ids)),
  ]);
  const decisionIds = decisions.map((d) => d.id);
  const [edits, proposals, tests] = decisionIds.length === 0 ? [[], [], []] : await Promise.all([
    db.select().from(t.edits).where(inArray(t.edits.decisionId, decisionIds)),
    db.select().from(t.proposals).where(inArray(t.proposals.decisionId, decisionIds)),
    db.select().from(t.testCases).where(inArray(t.testCases.sourceDecisionId, decisionIds)),
  ]);
  const replays = tests.length === 0 ? [] : await db.select().from(t.replayResults).where(inArray(t.replayResults.testCaseId, tests.map((x) => x.id)));
  const factMap = new Map(facts.map((f) => [f.id, toFact(f)]));
  const allFacts = [...factMap.values()];

  return wfs.map((wf) => {
    const wfDrafts = drafts.filter((d) => d.workflowId === wf.id).sort((a, b) => a.version - b.version);
    const agent = wfDrafts[0]!;
    const latest = wfDrafts.at(-1)!;
    const decision = decisions.find((d) => d.workflowId === wf.id) ?? null;
    const wfRisks = risks.filter((r) => r.workflowId === wf.id);
    const before = decision ? wfRisks.filter((r) => r.createdAt < decision.decidedAt) : wfRisks;
    const after = decision ? wfRisks.filter((r) => r.createdAt >= decision.decidedAt) : [];
    const shown = strictest((after.length > 0 ? after : before).map((r) => ({ risk: r })));
    const wfExecs = executions.filter((e) => e.workflowId === wf.id);
    const wfProposals = proposals.filter((p) => p.decisionId === decision?.id);
    const wfTests = tests.filter((x) => x.sourceDecisionId === decision?.id).map((x) => {
      // The latest replay is the test's current status; older ones are history.
      const r = replays.filter((rp) => rp.testCaseId === x.id).sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime()).at(-1);
      const reason = (r?.output as { reason?: string } | null)?.reason ?? "not run";
      return { name: x.name, passed: r?.passed ?? false, reason, retired: x.retiredBy !== null };
    });
    const staleChanges = wf.state !== "awaiting_approval" ? [] : [...new Set(latest.content.claims.flatMap((c) => c.factIds))].flatMap((id) => {
      const f = factMap.get(id);
      const now = f?.supersededBy ? factMap.get(f.supersededBy) : undefined;
      return f && now ? [{ label: factLabel(f.key), from: formatValue(f.value ?? "unknown"), to: formatValue(now.value ?? "unknown") }] : [];
    });
    // Once a newer draft exists for the account, this one has already been redrafted.
    const redrafted = wfs.some((o) => o.accountId === wf.accountId && o.createdAt > wf.createdAt);
    const heldSentences = wf.state !== "blocked" || redrafted ? [] : latest.content.claims
      .filter((c) => isCommercial(c.sentence) || latest.verdicts?.some((v) => v.claimId === c.id && (v.label === "none" || v.label === "stale")))
      .map((c) => c.sentence);
    const kept = new Set(latest.content.claims.map((c) => c.id));
    const recipient = contacts.find((c) => c.id === wf.recipientContactId);
    const user = users.find((u) => u.id === decision?.userId);
    return {
      id: wf.id, accountId: wf.accountId, accountName: accounts.find((a) => a.id === wf.accountId)?.name ?? wf.accountId,
      state: wf.state, createdAt: wf.createdAt.toISOString(),
      recipient: recipient ? { name: recipient.name, email: recipient.email, title: recipient.title } : null,
      subject: latest.content.subject, claims: claimViews(latest, factMap), agentClaims: claimViews(agent, factMap),
      editedByRep: latest.author === "rep",
      insight: wf.insight,
      generation: (() => {
        const mine = runs.filter((r) => r.workflowId === wf.id).sort((a, b) => a.attempt - b.attempt);
        const last = mine.at(-1);
        return last ? { mode: last.mode, attempts: mine.length, promptVersion: last.promptVersion, model: last.model } : null;
      })(),
      risk: { ...explainRisk(shown, allFacts), verdict: shown.verdict },
      decision: decision && { kind: decision.kind, rejectReason: decision.rejectReason, rejectFact: decision.rejectFactKey ? factLabel(decision.rejectFactKey) : null, reviewMs: decision.reviewMs, userName: user?.name ?? decision.userId, decidedAt: decision.decidedAt.toISOString() },
      edits: edits.filter((e) => e.decisionId === decision?.id).map((e) => ({
        id: e.id, before: e.before, after: e.after, category: e.category, severity: e.severity, method: e.method,
        route: e.category ? routeFeedback({ kind: "edit", category: e.category }) : null,
      })),
      corrections: wfProposals.map((p) => {
        const old = factMap.get(p.currentFactId ?? "");
        return { label: factLabel(p.factKey), from: formatValue(old?.value ?? "unknown"), to: formatValue(p.proposedValue) };
      }),
      tests: wfTests, staleChanges, heldSentences,
      removedSentences: agent.content.claims.filter((c) => !kept.has(c.id)).map((c) => c.sentence),
      executions: wfExecs.map((e) => ({ action: e.action, payload: e.payload, hashMatches: e.contentHash === latest.contentHash, executedAt: e.executedAt.toISOString() })),
      journey: computeJourney({
        state: wf.state, decision: decision && { kind: decision.kind, rejectReason: decision.rejectReason },
        executed: wfExecs.filter((e) => e.status === "succeeded").map((e) => e.action),
        corrections: wfProposals.length, testsPassing: wfTests.filter((x) => x.passed && !x.retired).length,
      }),
    };
  });
}
