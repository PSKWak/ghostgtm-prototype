import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { getActivePromptVersion, setActivePromptVersion } from "@/lib/db/settings";
import { approveWorkflow } from "@/lib/flow/approve";
import { generateWorkflow } from "@/lib/flow/generate";
import { replayAll } from "@/lib/flow/replay-all";
import { createTestCaseFromEdit } from "@/lib/flow/test-cases";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";
import { computeTrustLevel } from "@/lib/metrics/trust";

let db: Db;
beforeEach(async () => {
  db = await openMemoryDb();
  await resetDemo(db, { syntheticHistory: true });
});
const later = () => new Date(Date.now() + 60_000).toISOString();

async function correctBrightline() {
  const g = await generateWorkflow(db, "acct_brightline", null);
  if (!g.ok) throw new Error(g.reason);
  await approveWorkflow(db, { workflowId: g.value.workflowId, userId: "u_maya", reviewMs: 20_000, now: later(),
    claimEdits: [{ id: "renewal", sentence: "I have your renewal down for December 31, 2026." }], confirmCorrections: true });
  return g.value.workflowId;
}

describe("synthetic history", () => {
  it("is flagged, counted in metrics, and ignored by the trust ladder", async () => {
    const rows = await loadMetricRows(db);
    expect(rows.decisions.length).toBe(57);
    expect(rows.decisions.every((d) => d.isSynthetic)).toBe(true);
    const all = computeMetrics(rows, false).find((m) => m.def.id === "clean_approval_rate")!.result;
    expect(all).toMatchObject({ syntheticCount: 53, realCount: 0 }); // 57 decisions minus 4 ignored
    const real = computeMetrics(rows, true).find((m) => m.def.id === "clean_approval_rate")!.result;
    expect(real).toMatchObject({ denominator: 0, value: null });
    expect(computeTrustLevel(rows).level).toBe(0);
  });

  it("never shows up as work in Slack or the CRM", async () => {
    const { loadWorkflowViews } = await import("@/lib/db/views/workflows");
    expect(await loadWorkflowViews(db)).toEqual([]);
  });
});

describe("the synthetic story fills every decision metric (hand-computed from lib/db/synthetic-plan.ts)", () => {
  // Weeks: clean/rubber/edited/rejected/ignored = 3/2/5/4/2, 5/1/4/3/1, 7/1/3/2/1, 9/0/3/1/0
  //   → clean approvals 28 (24 read + 4 rubber stamps), edited 15, rejected 10, ignored 4 → decided 53, approved 43.
  const metric = async (id: string) => computeMetrics(await loadMetricRows(db), false).find((m) => m.def.id === id)!.result;

  it("rep decisions", async () => {
    expect(await metric("clean_approval_rate")).toMatchObject({ numerator: 24, denominator: 53 });
    expect(await metric("rubber_stamp_rate")).toMatchObject({ numerator: 4, denominator: 28 });
    expect(await metric("fact_correction_rate")).toMatchObject({ numerator: 3, denominator: 43 }); // dateFix ×2 + seatFix
    expect(await metric("completion_rate")).toMatchObject({ numerator: 42, denominator: 43 }); // one failed write
    const mix = await metric("reject_reason_mix");
    expect(mix.breakdown?.map((b) => [b.key, b.numerator])).toEqual([["bad_timing", 4], ["wrong_fact", 3], ["too_risky", 2], ["wrong_action", 1]]);
  });

  it("execution and grounding", async () => {
    expect(await metric("write_fidelity")).toMatchObject({ numerator: 128, denominator: 129 }); // 43 approved × 3 writes, one hash mismatch
    // 57 decision workflows + 5 shield-held drafts = 62 live first tries; 10 failed verify first (4+3+2+1)
    expect(await metric("grounding_pass_rate")).toMatchObject({ numerator: 52, denominator: 62 });
  });

  it("leaves real-only empty and the trust level at 0", async () => {
    const rows = await loadMetricRows(db);
    expect(computeMetrics(rows, true).find((m) => m.def.id === "completion_rate")!.result).toMatchObject({ denominator: 0, value: null });
    expect(computeTrustLevel(rows)).toMatchObject({ level: 0, drop: null });
    expect(rows.blocks).toHaveLength(5);
  });

  it("is deterministic: a second reset produces identical metrics", async () => {
    const first = (await metric("clean_approval_rate")).rowIds;
    await resetDemo(db, { syntheticHistory: true });
    expect((await metric("clean_approval_rate")).rowIds).toEqual(first);
  });
});

describe("prompt version switch", () => {
  it("defaults to generate@v1 and is used by the next draft", async () => {
    expect(await getActivePromptVersion(db)).toBe("generate@v1");
    await setActivePromptVersion(db, "generate@baseline");
    const g = await generateWorkflow(db, "acct_ostrava", null);
    if (!g.ok) throw new Error(g.reason);
    const [wf] = await db.select().from(t.workflows).where(eq(t.workflows.id, g.value.workflowId));
    expect(wf?.promptVersion).toBe("generate@baseline");
  });
});

describe("replayAll", () => {
  it("replays every active test against every prompt version", async () => {
    await correctBrightline();
    const r = await replayAll(db);
    expect(r).toEqual({ ok: true, value: { replayed: 2 } }); // 1 test × 2 prompt versions
    const replays = await db.select().from(t.replayResults);
    expect(new Set(replays.map((x) => x.promptVersion))).toEqual(new Set(["generate@v1", "generate@baseline"]));
    expect(replays.every((x) => x.passed)).toBe(true);
  });
});

describe("turn an edit into a test case", () => {
  it("creates a test linked to the decision, once", async () => {
    const g = await generateWorkflow(db, "acct_ostrava", null);
    if (!g.ok) throw new Error(g.reason);
    await approveWorkflow(db, { workflowId: g.value.workflowId, userId: "u_maya", reviewMs: 9000, now: later(), confirmCorrections: false,
      claimEdits: [{ id: "roi", sentence: "I'll put together the one-page ROI summary this week, including Jana Svoboda's maintenance savings." }] });
    // Synthetic history also has missing_context edits, so pick the one this test just made.
    const edit = (await db.select().from(t.edits).where(eq(t.edits.category, "missing_context"))).find((e) => e.after.includes("Jana Svoboda"));
    if (!edit) throw new Error("expected a missing_context edit");
    const r = await createTestCaseFromEdit(db, edit.id);
    if (!r.ok) throw new Error(r.reason);
    const [tc] = await db.select().from(t.testCases).where(eq(t.testCases.id, r.value.testCaseId));
    expect(tc).toMatchObject({ sourceDecisionId: edit.decisionId, accountId: "acct_ostrava" });
    expect(tc?.expectation.mustContain).toBe("week, including Jana Svoboda's maintenance savings");
    expect(await createTestCaseFromEdit(db, edit.id)).toEqual({ ok: false, reason: "this edit is already a test case" });
  });

  it("refuses a removal, which has nothing to keep", async () => {
    const g = await generateWorkflow(db, "acct_ostrava", null);
    if (!g.ok) throw new Error(g.reason);
    await approveWorkflow(db, { workflowId: g.value.workflowId, userId: "u_maya", reviewMs: 9000, now: later(), confirmCorrections: false, claimEdits: [{ id: "roi", sentence: "" }] });
    const edit = (await db.select().from(t.edits).where(eq(t.edits.after, ""))).find((e) => e.decisionId.startsWith("dec_") && !e.decisionId.startsWith("dec_syn_"));
    expect(await createTestCaseFromEdit(db, edit!.id)).toEqual({ ok: false, reason: "a removed sentence can't become a test; there is nothing to keep" });
  });
});
