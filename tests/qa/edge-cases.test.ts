// Regression tests for the QA findings (Q1–Q13) and the product edge cases.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { generateWorkflow } from "@/lib/flow/generate";
import { approveWorkflow, type ApproveRequest } from "@/lib/flow/approve";
import { redraftWorkflow } from "@/lib/flow/redraft";
import { rejectWorkflow } from "@/lib/flow/reject";
import { assessRisk, type RiskInput } from "@/lib/engine/risk";
import { proposeCorrections } from "@/lib/engine/proposals";
import { classifyEdits, diffBody } from "@/lib/engine/diff";
import type { Draft, Fact } from "@/lib/engine/types";

let db: Db;
beforeEach(async () => {
  db = await openMemoryDb();
  await resetDemo(db);
});
const NOW = () => new Date(Date.now() + 60_000).toISOString();
const gen = async (a: string) => {
  const r = await generateWorkflow(db, a, null);
  if (!r.ok) throw new Error(r.reason);
  return r.value.workflowId;
};
const approve = (workflowId: string, extra: Partial<ApproveRequest> = {}) =>
  approveWorkflow(db, { workflowId, userId: "u_maya", reviewMs: 20_000, claimEdits: [], confirmCorrections: false, now: NOW(), ...extra });
const kindOf = async (p: ReturnType<typeof approve>) => {
  const r = await p;
  return r.ok ? r.value.kind : `error: ${r.reason}`;
};
const fixDate = (d: string) => [{ id: "renewal", sentence: `I have your renewal down for ${d}.` }];
const emailOf = async (wf: string) =>
  (await db.select().from(t.executions).where(eq(t.executions.workflowId, wf))).find((e) => e.action === "send_email")?.payload;

describe("Q1 rule 5: a greeting can't smuggle in claims", () => {
  it("asks for a fix when a greeting states figures", async () => {
    const wf = await gen("acct_brightline");
    const r = await approve(wf, { claimEdits: [{ id: "hi", sentence: "Hi Dana, you're getting 40% off and your renewal is June 1, 2025," }] });
    expect(r.ok && r.value.kind === "fix" && r.value.problems[0]?.reason).toBe("states something no fact on record backs");
  });
});

describe("Q2 clearing a sentence removes it", () => {
  it("sends without the sentence and records the removal as an edit", async () => {
    const wf = await gen("acct_brightline");
    expect(await kindOf(approve(wf, { claimEdits: [{ id: "seats", sentence: "   " }], acknowledgeChallenged: true }))).toBe("done");
    const email = await emailOf(wf);
    expect(email?.kind === "email" && email.body).not.toContain("140 seats");
    const [edit] = await db.select().from(t.edits);
    expect(edit).toMatchObject({ before: "Great to hear all 140 seats are live.", after: "" });
  });
});

describe("Q3 impossible dates", () => {
  it("refuses February 30 with a plain reason", async () => {
    const wf = await gen("acct_brightline");
    const r = await approve(wf, { claimEdits: fixDate("February 30, 2026") });
    expect(r.ok && r.value.kind === "fix" && r.value.problems[0]?.reason).toBe(`"February 30, 2026" isn't a real date`);
  });
});

describe("Q4 a rewritten sentence proposes just the value", () => {
  it("extracts the new approver's name", async () => {
    const wf = await gen("acct_ostrava");
    const r = await approve(wf, { claimEdits: [{ id: "approver", sentence: "I'll send it to Petra Novak, who signs off on budget." }] });
    expect(r.ok && r.value.kind === "confirm" && r.value.proposals[0]?.to).toBe("Petra Novak");
  });
});

describe("Q5 date formats", () => {
  for (const written of ["31 December 2026", "12/31/2026", "31/12/2026"]) {
    it(`understands "${written}"`, async () => {
      const r = await approve(await gen("acct_brightline"), { claimEdits: fixDate(written) });
      expect(r.ok && r.value.kind === "confirm" && r.value.proposals[0]?.to).toBe("December 31, 2026");
    });
  }
  it("asks instead of guessing an ambiguous date", async () => {
    const r = await approve(await gen("acct_brightline"), { claimEdits: fixDate("03/04/2027") });
    expect(r.ok && r.value.kind === "fix" && r.value.problems[0]?.reason).toContain("two different dates");
  });
});

describe("Q6 concurrent approvals", () => {
  it("returns a clean error for the second and records one decision", async () => {
    const wf = await gen("acct_ostrava");
    const results = await Promise.all([approve(wf), approve(wf)]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
    expect(await db.select().from(t.decisions).where(eq(t.decisions.workflowId, wf))).toHaveLength(1);
    expect(await db.select().from(t.executions).where(eq(t.executions.workflowId, wf))).toHaveLength(3);
  });
});

describe("Q7 a pending draft the record moved past", () => {
  it("says what changed, and redrafting expires it and uses the new value", async () => {
    const a = await gen("acct_brightline");
    const b = await gen("acct_brightline");
    await approve(a, { claimEdits: fixDate("December 31, 2026"), confirmCorrections: true });
    const r = await approve(b);
    expect(r.ok && r.value).toEqual({ kind: "stale", changes: [{ factKey: "renewal_date", label: "Renewal date", from: "March 31, 2027", to: "December 31, 2026" }] });
    const fresh = await redraftWorkflow(db, b);
    if (!fresh.ok) throw new Error(fresh.reason);
    const [old] = await db.select().from(t.workflows).where(eq(t.workflows.id, b));
    expect(old?.state).toBe("expired");
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, fresh.value.workflowId));
    expect(draft?.content.claims.find((c) => c.id === "renewal")?.sentence).toContain("December 31, 2026");
  });
});

describe("Q8 regression tests track the latest draft", () => {
  it("retires a test when the same fact is corrected again, and replays on every new draft", async () => {
    await approve(await gen("acct_brightline"), { claimEdits: fixDate("December 31, 2026"), confirmCorrections: true });
    await approve(await gen("acct_brightline"), { claimEdits: fixDate("January 15, 2027"), confirmCorrections: true });
    const tests = await db.select().from(t.testCases);
    const dec = tests.find((x) => x.expectation.mustContain === "December 31, 2026");
    const jan = tests.find((x) => x.expectation.mustContain === "January 15, 2027");
    expect(dec?.retiredBy).toBe(jan?.id);
    await gen("acct_brightline");
    const janReplays = (await db.select().from(t.replayResults)).filter((r) => r.testCaseId === jan?.id);
    expect(janReplays.length).toBeGreaterThanOrEqual(2);
    expect(janReplays.every((r) => r.passed)).toBe(true);
  });
});

describe("Q9 shield catches paraphrased pitches, but not mentions", () => {
  const base: RiskInput = {
    action: "send_email", draftText: "", accountDomain: "halcyonclinics.org",
    recipient: { email: "ben.whitaker@halcyonclinics.org", isExecutive: false }, verdicts: [],
    citedFactIds: [], contestedFactIds: [], challengedFactIds: [], openEscalation: true, approval: "approved", trustLevel: 0,
  };
  for (const pitch of [
    "Once this is fixed, let's talk about rolling Ghost out to your other clinics.",
    "Happy to walk you through our Q4 offer when you're ready.",
    "We could also grow your footprint next quarter.",
  ]) it(`blocks: "${pitch}"`, () => expect(assessRisk({ ...base, draftText: pitch }).verdict).toBe("block"));
  it("allows a sentence that only mentions new seats", () => {
    expect(assessRisk({ ...base, draftText: "The sync now covers the new seats your front desk added." }).verdict).toBe("allow");
  });
});

describe("Q10 diff attribution at a sentence boundary", () => {
  it("attributes an edit at the start of a sentence to that sentence", () => {
    const f: Fact = { id: "seats", accountId: "a", key: "seat_count", value: "140", source: "crm_explicit", sourceRef: "x", observedAt: "2026-01-01T00:00:00Z", supersededBy: null, supersededReason: null };
    const draft: Draft = { subject: "s", claims: [
      { id: "a", sentence: "Thanks for the time.", factIds: [], factual: false },
      { id: "b", sentence: "140 seats are live.", factIds: ["seats"], factual: true },
    ] };
    const { classified } = classifyEdits(diffBody(draft, "Thanks for the time. Now 150 seats are live."), draft, [f]);
    expect(proposeCorrections(classified, [f]).proposals[0]?.proposedValue).toBe("150");
  });
});

describe("Q11–Q13 API-level inputs", () => {
  it("refuses edits to unknown sentences instead of silently sending", async () => {
    const wf = await gen("acct_ostrava");
    expect(await approve(wf, { claimEdits: [{ id: "nope", sentence: "x" }] })).toEqual({ ok: false, reason: "unknown sentence id(s): nope" });
  });
  it("caps review time at how long the draft has existed", async () => {
    const wf = await gen("acct_ostrava");
    await approve(wf, { reviewMs: 999_999_999 });
    const [d] = await db.select().from(t.decisions);
    expect(d?.reviewMs).toBeLessThan(5 * 60_000);
  });
});

describe("product edge cases", () => {
  it("asks the rep to acknowledge before sending a value newer evidence contradicts", async () => {
    const wf = await gen("acct_brightline");
    const r = await approve(wf);
    expect(r.ok && r.value).toEqual({ kind: "acknowledge", challenged: [{ factKey: "renewal_date", label: "Renewal date", from: "March 31, 2027", to: "December 31, 2026" }] });
    expect(await kindOf(approve(wf, { acknowledgeChallenged: true }))).toBe("done");
  });

  it("records which fact was wrong on a wrong_fact rejection", async () => {
    const wf = await gen("acct_brightline");
    expect(await rejectWorkflow(db, { workflowId: wf, userId: "u_maya", reason: "wrong_fact", reviewMs: 5000, factKey: "renewal_date" })).toEqual({ ok: true, value: "rejected" });
    const [d] = await db.select().from(t.decisions);
    expect(d?.rejectFactKey).toBe("renewal_date");
  });

  it("refuses a fact the draft doesn't cite", async () => {
    const wf = await gen("acct_brightline");
    expect((await rejectWorkflow(db, { workflowId: wf, userId: "u_maya", reason: "wrong_fact", reviewMs: 5000, factKey: "arr" })).ok).toBe(false);
  });

  it("lets a held Halcyon draft be redrafted without the pitch, which then needs approval", async () => {
    const held = await gen("acct_halcyon");
    const fresh = await redraftWorkflow(db, held);
    if (!fresh.ok) throw new Error(fresh.reason);
    expect(fresh.value.state).toBe("awaiting_approval");
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, fresh.value.workflowId));
    expect(draft?.content.claims.map((c) => c.id)).not.toContain("expansion");
    const [old] = await db.select().from(t.workflows).where(eq(t.workflows.id, held));
    expect(old?.state).toBe("blocked");
  });

  it("uses no gendered pronoun for the approver", async () => {
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, await gen("acct_ostrava")));
    expect(draft?.content.claims.find((c) => c.id === "approver")?.sentence).not.toMatch(/\b(he|she)\b/);
  });
});
