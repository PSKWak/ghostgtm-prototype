import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { generateWorkflow } from "@/lib/flow/generate";
import { approveWorkflow } from "@/lib/flow/approve";
import { rejectWorkflow } from "@/lib/flow/reject";

let db: Db;
beforeEach(async () => {
  db = await openMemoryDb();
  await resetDemo(db);
});

const NOW = "2026-10-04T12:00:00Z";
const approve = (workflowId: string, extra: Partial<Parameters<typeof approveWorkflow>[1]> = {}) =>
  approveWorkflow(db, { workflowId, userId: "u_maya", reviewMs: 21_000, claimEdits: [], confirmCorrections: false, now: NOW, ...extra });
const fixDate = [{ id: "renewal", sentence: "I have your renewal down for December 31, 2026." }];

async function generate(accountId: string) {
  const r = await generateWorkflow(db, accountId, null);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
const executionsOf = (wf: string) => db.select().from(t.executions).where(eq(t.executions.workflowId, wf));

describe("Flow A: Brightline, context to validated learning", () => {
  it("drafts with the stale CRM date and holds it for approval because the call contradicts it", async () => {
    const { workflowId, state } = await generate("acct_brightline");
    expect(state).toBe("awaiting_approval");
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, workflowId));
    expect(draft?.content.claims.find((c) => c.id === "renewal")?.sentence).toBe("I have your renewal down for March 31, 2027.");
    expect(draft?.verdicts?.every((v) => v.label === "supported")).toBe(true);
    const checks = await db.select().from(t.riskChecks).where(eq(t.riskChecks.workflowId, workflowId));
    expect(checks.find((c) => c.action === "send_email")?.rule).toBe("challenged_fact");
  });

  it("asks the rep to confirm a fact edit before anything is written (rule 7)", async () => {
    const { workflowId } = await generate("acct_brightline");
    const r = await approve(workflowId, { claimEdits: fixDate });
    expect(r).toEqual({ ok: true, value: { kind: "confirm", proposals: [
      { factKey: "renewal_date", label: "Renewal date", from: "March 31, 2027", to: "December 31, 2026" },
    ] } });
    expect(await db.select().from(t.decisions)).toHaveLength(0);
    expect(await db.select().from(t.executions)).toHaveLength(0);
  });

  it("completes the journey: sends, logs, corrects the graph, and the regression test passes", async () => {
    const { workflowId } = await generate("acct_brightline");
    const r = await approve(workflowId, { claimEdits: fixDate, confirmCorrections: true });
    expect(r).toEqual({ ok: true, value: { kind: "done", workflowId, state: "completed" } });

    const execs = await executionsOf(workflowId);
    expect(execs.map((e) => e.action).sort()).toEqual(["create_crm_task", "log_crm_activity", "send_email"]);
    const approvedDraft = (await db.select().from(t.drafts).where(eq(t.drafts.workflowId, workflowId))).find((d) => d.author === "rep");
    expect(execs.every((e) => e.contentHash === approvedDraft?.contentHash && e.simulated)).toBe(true);
    expect(execs.find((e) => e.action === "send_email")?.payload).toMatchObject({ kind: "email", to: "dana.okafor@brightlinefreight.com" });

    const [edit] = await db.select().from(t.edits);
    expect(edit).toMatchObject({ category: "fact_correction", severity: "critical", method: "rule", factId: "f_bf_renewal_crm" });

    const renewal = await db.select().from(t.facts).where(eq(t.facts.key, "renewal_date"));
    const human = renewal.find((f) => f.source === "human_approved");
    expect(human).toMatchObject({ value: "2026-12-31", confirmedBy: "u_maya", supersededBy: null });
    expect(renewal.find((f) => f.id === "f_bf_renewal_crm")).toMatchObject({ supersededBy: human?.id, supersededReason: "human_approved outranks crm_explicit" });

    const [test] = await db.select().from(t.testCases);
    expect(test?.expectation).toEqual({ factKey: "renewal_date", mustContain: "December 31, 2026" });
    const [replay] = await db.select().from(t.replayResults);
    expect(replay?.passed).toBe(true);
  });

  it("the next draft states the corrected date with no edit and no challenge", async () => {
    const first = await generate("acct_brightline");
    await approve(first.workflowId, { claimEdits: fixDate, confirmCorrections: true });
    const second = await generate("acct_brightline");
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, second.workflowId));
    expect(draft?.content.claims.find((c) => c.id === "renewal")?.sentence).toBe("I have your renewal down for December 31, 2026.");
    const checks = await db.select().from(t.riskChecks).where(eq(t.riskChecks.workflowId, second.workflowId));
    expect(checks.some((c) => c.rule === "challenged_fact")).toBe(false);
  });

  it("treats a changed number on a cited fact as a proposed correction", async () => {
    const { workflowId } = await generate("acct_brightline");
    const r = await approve(workflowId, { claimEdits: [{ id: "seats", sentence: "Great to hear all 150 seats are live." }] });
    expect(r.ok && r.value.kind === "confirm" && r.value.proposals[0]).toMatchObject({ factKey: "seat_count", from: "140", to: "150" });
  });

  it("treats moving a date by changing only the day as a proposed correction that keeps the rest of the fact", async () => {
    // Found on production: this edit was refused as "isn't backed by the record".
    const { workflowId } = await generate("acct_brightline");
    const r = await approve(workflowId, { claimEdits: [{ id: "next", sentence: "Next step on our side: Security review call, week of October 19, 2026." }] });
    expect(r.ok && r.value.kind === "confirm" && r.value.proposals).toEqual([
      expect.objectContaining({ factKey: "next_step", to: "Security review call, week of October 19, 2026" }),
    ]);
  });

  it("refuses an edit no fact backs, and writes nothing", async () => {
    const { workflowId } = await generate("acct_brightline");
    const r = await approve(workflowId, { claimEdits: [{ id: "docs", sentence: "As Luis asked, I'll send over the SOC 2 Type II report and API rate-limit doc in 3 days." }] });
    expect(r.ok && r.value.kind).toBe("fix");
    expect(await db.select().from(t.decisions)).toHaveLength(0);
  });

  it("approves a clean draft once and never executes twice (rule 4)", async () => {
    const { workflowId } = await generate("acct_brightline");
    expect((await approve(workflowId, { acknowledgeChallenged: true })).ok).toBe(true);
    expect(await approve(workflowId, { acknowledgeChallenged: true })).toEqual({ ok: false, reason: "workflow is completed, not awaiting approval" });
    expect(await executionsOf(workflowId)).toHaveLength(3);
  });

  it("rejects with a reason and executes nothing (rule 2)", async () => {
    const { workflowId } = await generate("acct_brightline");
    expect(await rejectWorkflow(db, { workflowId, userId: "u_maya", reason: "wrong_fact", reviewMs: 9000 })).toEqual({ ok: true, value: "rejected" });
    expect(await executionsOf(workflowId)).toHaveLength(0);
    expect((await approve(workflowId)).ok).toBe(false);
  });
});

describe("the other risk tiers", () => {
  it("Halcyon: the shield blocks a pitch during the open escalation, and it can never execute", async () => {
    const { workflowId, state } = await generate("acct_halcyon");
    expect(state).toBe("blocked");
    const checks = await db.select().from(t.riskChecks).where(eq(t.riskChecks.workflowId, workflowId));
    expect(checks.every((c) => c.rule === "commercial_during_escalation")).toBe(true);
    expect((await approve(workflowId)).ok).toBe(false);
    expect(await executionsOf(workflowId)).toHaveLength(0);
  });

  it("Ostrava: a contested approver needs approval, then completes", async () => {
    const { workflowId, state } = await generate("acct_ostrava");
    expect(state).toBe("awaiting_approval");
    const checks = await db.select().from(t.riskChecks).where(eq(t.riskChecks.workflowId, workflowId));
    expect(checks.find((c) => c.action === "send_email")?.rule).toBe("contested_fact");
    expect(await approve(workflowId)).toEqual({ ok: true, value: { kind: "done", workflowId, state: "completed" } });
  });
});
