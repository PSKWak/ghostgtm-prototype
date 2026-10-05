import { beforeAll, describe, expect, it } from "vitest";
import { eq, like, not } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { loadWorkflowViews } from "@/lib/db/views/workflows";
import { generateWorkflow } from "@/lib/flow/generate";
import { redraftWorkflow } from "@/lib/flow/redraft";
import { computeMetrics, loadMetricRows } from "@/lib/metrics/compute";
import { computeTrustLevel } from "@/lib/metrics/trust";

let db: Db;
beforeAll(async () => {
  db = await openMemoryDb();
  await resetDemo(db, { syntheticHistory: true, walkthrough: true });
});

describe("the synthetic walkthrough", () => {
  it("takes three account copies through the journey with the real flows", async () => {
    const wfs = await db.select().from(t.workflows).where(like(t.workflows.accountId, "demo_%"));
    const states = (acct: string) => wfs.filter((w) => w.accountId === acct).map((w) => w.state).sort();
    expect(states("demo_acct_brightline")).toEqual(["completed", "completed"]); // corrected, then right on its own
    expect(states("demo_acct_halcyon")).toEqual(["blocked", "completed"]); // shield hold, then the redraft
    expect(states("demo_acct_ostrava")).toEqual(["completed", "rejected"]);
    expect(wfs.every((w) => w.isSynthetic)).toBe(true);
  });

  it("corrects the copy's record and turns edits into passing regression tests", async () => {
    const [human] = await db.select().from(t.facts).where(eq(t.facts.source, "human_approved"));
    expect(human).toMatchObject({ accountId: "demo_acct_brightline", key: "renewal_date", value: "2026-12-31", isSynthetic: true });
    const tests = await db.select().from(t.testCases);
    expect(tests.map((x) => x.accountId).sort()).toEqual(["demo_acct_brightline", "demo_acct_ostrava"]);
    expect((await db.select().from(t.replayResults)).every((r) => r.passed)).toBe(true);
  });

  it("leaves the live demo accounts untouched", async () => {
    expect(await db.select().from(t.workflows).where(eq(t.workflows.accountId, "acct_brightline")).then((r) => r.filter((w) => !w.isSynthetic))).toEqual([]);
    const live = await db.select().from(t.facts).where(eq(t.facts.accountId, "acct_brightline"));
    expect(live.some((f) => f.source === "human_approved")).toBe(false); // the stale renewal story is still there to click
  });

  it("shows walkthrough work in the views, badged, but never the bulk eval history", async () => {
    const views = await loadWorkflowViews(db);
    expect(views).toHaveLength(6);
    expect(views.every((v) => v.synthetic && v.accountId.startsWith("demo_"))).toBe(true);
  });

  it("reads in story order, newest first, with real review times", async () => {
    const views = await loadWorkflowViews(db);
    // Story: Brightline corrected → Brightline clean → Halcyon held → Halcyon redraft → Ostrava rejected → Ostrava edited
    expect(views.map((v) => `${v.accountId.replace("demo_acct_", "")}:${v.state}`)).toEqual([
      "ostrava:completed", "ostrava:rejected", "halcyon:completed", "halcyon:blocked", "brightline:completed", "brightline:completed",
    ]);
    expect(views[1]!.decision).toMatchObject({ kind: "rejected", reviewMs: 9_000 });
    // A test made from a missing-context edit has not been replayed yet: shown as such, not as failing.
    expect(views[0]!.tests).toEqual([expect.objectContaining({ passed: null, reason: "not run" })]);
  });

  it("explains a live draft from its own account's facts, never the walkthrough copy's", async () => {
    // Found by the e2e test: the live Brightline banner quoted the walkthrough rep's correction.
    const g = await generateWorkflow(db, "acct_brightline", null);
    if (!g.ok) throw new Error(g.reason);
    const view = (await loadWorkflowViews(db, { accountId: "acct_brightline" })).find((v) => v.id === g.value.workflowId)!;
    expect(view.risk.detail).toContain("a call on 2026-10-01 said December 31, 2026");
    await db.delete(t.riskChecks).where(eq(t.riskChecks.workflowId, g.value.workflowId));
    await db.delete(t.aiRuns).where(eq(t.aiRuns.workflowId, g.value.workflowId));
    await db.delete(t.drafts).where(eq(t.drafts.workflowId, g.value.workflowId));
    await db.delete(t.workflows).where(eq(t.workflows.id, g.value.workflowId));
  });

  it("refuses new drafts and redrafts on a walkthrough account, so no real work hides there", async () => {
    const refusal = { ok: false, reason: "this is a finished synthetic walkthrough; draft on one of the live accounts" };
    expect(await generateWorkflow(db, "demo_acct_ostrava", null)).toEqual(refusal);
    const [held] = await db.select().from(t.workflows).where(eq(t.workflows.state, "blocked")).then((r) => r.filter((w) => w.accountId === "demo_acct_halcyon"));
    expect(await redraftWorkflow(db, held!.id)).toEqual(refusal);
  });

  it("counts as synthetic everywhere: real-only metrics and the trust ladder ignore it", async () => {
    const rows = await loadMetricRows(db);
    expect(rows.decisions.filter((d) => !d.isSynthetic)).toEqual([]);
    expect(rows.replays.every((r) => r.isSynthetic)).toBe(true);
    expect(computeMetrics(rows, true).find((m) => m.def.id === "replay_pass_rate")!.result.denominator).toBe(0);
    expect(computeTrustLevel(rows)).toMatchObject({ level: 0, drop: null });
    expect(await db.select().from(t.decisions).where(not(t.decisions.isSynthetic))).toEqual([]);
  });
});
