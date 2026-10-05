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
    expect(rows.decisions.length).toBe(28);
    expect(rows.decisions.every((d) => d.isSynthetic)).toBe(true);
    const all = computeMetrics(rows, false).find((m) => m.def.id === "clean_approval_rate")!.result;
    expect(all).toMatchObject({ syntheticCount: 28, realCount: 0 });
    const real = computeMetrics(rows, true).find((m) => m.def.id === "clean_approval_rate")!.result;
    expect(real).toMatchObject({ denominator: 0, value: null });
    expect(computeTrustLevel(rows).level).toBe(0);
  });

  it("never shows up as work in Slack or the CRM", async () => {
    const { loadWorkflowViews } = await import("@/lib/db/views/workflows");
    expect(await loadWorkflowViews(db)).toEqual([]);
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
    const [edit] = await db.select().from(t.edits).where(eq(t.edits.category, "missing_context"));
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
    const [edit] = await db.select().from(t.edits).where(eq(t.edits.after, ""));
    expect(await createTestCaseFromEdit(db, edit!.id)).toEqual({ ok: false, reason: "a removed sentence can't become a test; there is nothing to keep" });
  });
});
