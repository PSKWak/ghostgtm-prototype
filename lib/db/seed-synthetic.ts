import { renderDraft } from "@/lib/engine/templates";
import { hashDraft } from "@/lib/engine/hash";
import { simulateExecution } from "@/lib/engine/execute";
import type { DecisionKind, EditCategory, Fact, RejectReason, Severity } from "@/lib/engine/types";
import { FOLLOW_UP_TEMPLATES } from "@/lib/llm/fixtures";
import type { Db } from "./client";
import * as t from "./schema";

// Synthetic decision history so the Evals Console has something to show before real
// reps use it. Every row is flagged is_synthetic (rule 10); trust-ladder gates and the
// "Real only" view ignore all of it. The mix is illustrative, not a measurement.

type Plan = { kind: DecisionKind; reviewMs: number; reason?: RejectReason; edit?: [EditCategory, Severity] };
const PLAN: Plan[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ kind: "approved_clean" as const, reviewMs: 15_000 + i * 2_500 })),
  { kind: "approved_clean", reviewMs: 2_100 }, { kind: "approved_clean", reviewMs: 3_400 }, // rubber stamps
  ...Array.from({ length: 3 }, () => ({ kind: "approved_edited" as const, reviewMs: 40_000, edit: ["fact_correction", "major"] as [EditCategory, Severity] })),
  ...Array.from({ length: 5 }, () => ({ kind: "approved_edited" as const, reviewMs: 28_000, edit: ["style", "minor"] as [EditCategory, Severity] })),
  { kind: "rejected", reviewMs: 12_000, reason: "wrong_fact" }, { kind: "rejected", reviewMs: 9_000, reason: "wrong_fact" },
  { kind: "rejected", reviewMs: 7_000, reason: "bad_timing" }, { kind: "rejected", reviewMs: 6_000, reason: "bad_timing" },
  { kind: "rejected", reviewMs: 15_000, reason: "too_risky" }, { kind: "rejected", reviewMs: 11_000, reason: "wrong_action" },
];
const ACCOUNTS = ["acct_brightline", "acct_halcyon", "acct_ostrava"];
const DAY = 86_400_000;

export async function seedSyntheticHistory(db: Db, facts: Fact[], now = Date.parse("2026-10-01T00:00:00Z")): Promise<void> {
  for (const [i, p] of PLAN.entries()) {
    const accountId = ACCOUNTS[i % ACCOUNTS.length]!;
    const template = FOLLOW_UP_TEMPLATES[accountId]!;
    const draft = renderDraft(template, facts.filter((f) => f.accountId === accountId && f.supersededBy === null));
    const at = new Date(now - (PLAN.length - i) * DAY);
    const id = `syn_${String(i + 1).padStart(2, "0")}`;
    const approved = p.kind === "approved_clean" || p.kind === "approved_edited";
    await db.insert(t.workflows).values({
      id: `wf_${id}`, accountId, state: approved ? "completed" : "rejected", promptVersion: "generate@v1",
      recipientContactId: template.recipientContactId, insight: template.insight, createdAt: at, isSynthetic: true,
    });
    await db.insert(t.drafts).values({ id: `d_${id}`, workflowId: `wf_${id}`, version: 1, author: "agent", content: draft, contentHash: hashDraft(draft), createdAt: at });
    await db.insert(t.decisions).values({
      id: `dec_${id}`, workflowId: `wf_${id}`, userId: "u_maya", kind: p.kind, rejectReason: p.reason ?? null,
      approvedDraftId: approved ? `d_${id}` : null, reviewMs: p.reviewMs, decidedAt: new Date(at.getTime() + p.reviewMs), isSynthetic: true,
    });
    if (p.edit) {
      await db.insert(t.edits).values({ id: `ed_${id}`, decisionId: `dec_${id}`, before: "(synthetic)", after: "(synthetic edit)", category: p.edit[0], severity: p.edit[1], method: "rule" });
    }
    if (approved) {
      await db.insert(t.executions).values((["send_email", "log_crm_activity", "create_crm_task"] as const).map((action) => {
        const { record, payload } = simulateExecution(action, draft, { to: null, nextStep: null, now: at.toISOString() });
        return { id: `ex_${id}_${action}`, workflowId: `wf_${id}`, draftId: `d_${id}`, ...record, payload, executedAt: at };
      }));
    }
  }
}
