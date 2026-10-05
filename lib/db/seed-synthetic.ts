import { hashDraft } from "@/lib/engine/hash";
import { simulateExecution } from "@/lib/engine/execute";
import { renderDraft } from "@/lib/engine/templates";
import type { ActionKind, Draft, Fact } from "@/lib/engine/types";
import { FOLLOW_UP_TEMPLATES } from "@/lib/llm/fixtures";
import type { Db } from "./client";
import * as t from "./schema";
import { blockedDays, planDecisions, SPAN_DAYS } from "./synthetic-plan";

// Synthetic decision history so the Evals Console has something to show before real
// reps use it. Every row is flagged is_synthetic (rule 10); the trust ladder and the
// "Real only" view ignore all of it, and the working views (Slack, CRM) never show it.
// The mix is illustrative, not a measurement.

const ACCOUNTS = ["acct_brightline", "acct_halcyon", "acct_ostrava"];
const ACTIONS: ActionKind[] = ["send_email", "log_crm_activity", "create_crm_task"];
const DAY = 86_400_000;
const SYNTHETIC_MODEL = "synthetic-sample"; // never pretend a synthetic run came from a real model

type Rows = {
  workflows: (typeof t.workflows.$inferInsert)[]; drafts: (typeof t.drafts.$inferInsert)[]; decisions: (typeof t.decisions.$inferInsert)[];
  edits: (typeof t.edits.$inferInsert)[]; executions: (typeof t.executions.$inferInsert)[]; runs: (typeof t.aiRuns.$inferInsert)[];
  risks: (typeof t.riskChecks.$inferInsert)[];
};

async function insertAll(db: Db, r: Rows): Promise<void> {
  // Parents before children; empty inserts are skipped because drizzle rejects them.
  if (r.workflows.length) await db.insert(t.workflows).values(r.workflows);
  if (r.drafts.length) await db.insert(t.drafts).values(r.drafts);
  if (r.decisions.length) await db.insert(t.decisions).values(r.decisions);
  if (r.edits.length) await db.insert(t.edits).values(r.edits);
  if (r.executions.length) await db.insert(t.executions).values(r.executions);
  if (r.risks.length) await db.insert(t.riskChecks).values(r.risks);
  if (r.runs.length) await db.insert(t.aiRuns).values(r.runs);
}

export async function seedSyntheticHistory(db: Db, facts: Fact[], now = Date.parse("2026-10-01T00:00:00Z")): Promise<void> {
  const at = (day: number, plusMs = 0) => new Date(now - (SPAN_DAYS - day) * DAY + plusMs);
  const draftFor = (accountId: string, withPitch: boolean): Draft => {
    const full = renderDraft(FOLLOW_UP_TEMPLATES[accountId]!, facts.filter((f) => f.accountId === accountId && f.supersededBy === null));
    // An approved Halcyon draft never contains the pitch the shield would hold.
    return withPitch ? full : { ...full, claims: full.claims.filter((c) => c.id !== "expansion") };
  };
  const rows: Rows = { workflows: [], drafts: [], decisions: [], edits: [], executions: [], runs: [], risks: [] };

  const addWorkflow = (id: string, accountId: string, state: "completed" | "failed" | "rejected" | "awaiting_approval" | "blocked", day: number, draft: Draft, firstTryFail: boolean, n: number) => {
    const created = at(day);
    rows.workflows.push({ id: `wf_${id}`, accountId, state, promptVersion: "generate@v1", recipientContactId: FOLLOW_UP_TEMPLATES[accountId]!.recipientContactId, insight: FOLLOW_UP_TEMPLATES[accountId]!.insight, createdAt: created, isSynthetic: true });
    rows.drafts.push({ id: `d_${id}`, workflowId: `wf_${id}`, version: 1, author: "agent", content: draft, contentHash: hashDraft(draft), createdAt: created });
    const run = (attempt: number, passed: boolean | null) => ({
      id: `run_${id}_${attempt}`, workflowId: `wf_${id}`, task: "generate" as const, promptVersion: "generate@v1", model: SYNTHETIC_MODEL, mode: "live" as const,
      input: { synthetic: true }, output: null, parseOk: true, verifyPassedFirstTry: passed, attempt, latencyMs: 3_000 + ((n * 613) % 6_000), createdAt: created, isSynthetic: true,
    });
    rows.runs.push(run(1, !firstTryFail));
    if (firstTryFail) rows.runs.push(run(2, null)); // the retry that fixed it
  };

  planDecisions().forEach((p, i) => {
    const id = `syn_${String(i + 1).padStart(2, "0")}`;
    const accountId = ACCOUNTS[i % ACCOUNTS.length]!;
    const approved = p.kind === "approved_clean" || p.kind === "approved_edited";
    const draft = draftFor(accountId, false);
    const state = p.kind === "rejected" ? "rejected" : p.kind === "ignored" ? "awaiting_approval" : p.failed ? "failed" : "completed";
    addWorkflow(id, accountId, state, p.day, draft, p.firstTryFail, i);
    rows.decisions.push({
      id: `dec_${id}`, workflowId: `wf_${id}`, userId: "u_maya", kind: p.kind, rejectReason: p.reason ?? null,
      approvedDraftId: approved ? `d_${id}` : null, reviewMs: p.reviewMs, decidedAt: at(p.day, p.reviewMs), isSynthetic: true,
    });
    p.edits.forEach((e, k) => rows.edits.push({ id: `ed_${id}_${k}`, decisionId: `dec_${id}`, before: e.before, after: e.after, category: e.category, severity: e.severity, method: e.method }));
    if (!approved) return;
    ACTIONS.forEach((action) => {
      const { record, payload } = simulateExecution(action, draft, { to: null, nextStep: null, now: at(p.day).toISOString() });
      // The one failed write landed different text than was approved (rule 3 catches it).
      const contentHash = p.failed && action === "create_crm_task" ? "synthetic-hash-mismatch" : record.contentHash;
      rows.executions.push({ id: `ex_${id}_${action}`, workflowId: `wf_${id}`, draftId: `d_${id}`, ...record, contentHash, payload, executedAt: at(p.day) });
    });
  });

  // Drafts the shield held: a sales pitch to an account with an open escalation.
  blockedDays().forEach((day, k) => {
    const id = `blk_${k + 1}`;
    addWorkflow(id, "acct_halcyon", "blocked", day, draftFor("acct_halcyon", true), false, 100 + k);
    ACTIONS.forEach((action) => rows.risks.push({ id: `rk_${id}_${action}`, workflowId: `wf_${id}`, action, verdict: "block", rule: "commercial_during_escalation", reason: "open support escalation: commercial asks are paused", createdAt: at(day) }));
  });
  await insertAll(db, rows);
}
