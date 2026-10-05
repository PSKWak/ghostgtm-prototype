import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { runAutonomy } from "@/lib/evals/experiments/autonomy";
import { runFeedback } from "@/lib/evals/experiments/feedback";
import { runGrounding } from "@/lib/evals/experiments/grounding";
import { runGroundingAudit } from "@/lib/evals/experiments/grounding-audit";
import { runExperiment } from "@/lib/evals/runner";
import type { ModelCall } from "@/lib/llm/model";

// Mechanics only. These tests never assert an experiment's outcome: the outcome is
// what the run measures, and asserting it here would tune the code to the labels.

describe("autonomy runner", () => {
  const rows = runAutonomy();
  it("evaluates all 60 actions under all 3 policies, as synthetic rows", () => {
    expect(rows).toHaveLength(180);
    expect(rows.every((r) => r.isSynthetic)).toBe(true);
  });
  it("never auto-runs under approve-everything", () => {
    expect(rows.filter((r) => r.arm === "approve_everything").every((r) => (r.result as { autoRun: boolean }).autoRun === false)).toBe(true);
  });
  it("auto-runs on confidence alone above 0.8 under confidence-only", () => {
    const get = (id: string) => rows.find((r) => r.arm === "confidence_only" && r.caseId === id)!.result as { autoRun: boolean };
    expect(get("au_33").autoRun).toBe(true); // confidence 0.96
    expect(get("au_40").autoRun).toBe(false); // confidence 0.62
  });
  it("records the risk.ts verdict and rule for every risk_policy row", () => {
    expect(rows.filter((r) => r.arm === "risk_policy").every((r) => typeof (r.result as { rule?: string }).rule === "string")).toBe(true);
  });
});

describe("feedback runner", () => {
  it("runs 17 cases in both arms; the baseline sends everything to prompt review", async () => {
    const rows = await runFeedback({ mode: "fixture", callModel: async () => { throw new Error("no model in fixture mode"); } });
    expect(rows).toHaveLength(34);
    expect(rows.filter((r) => r.arm === "baseline").every((r) => (r.result as { actualRoute: string }).actualRoute === "prompt")).toBe(true);
    const reject = rows.find((r) => r.arm === "method" && r.caseId === "fb_16")!.result as { actualRoute: string };
    expect(reject.actualRoute).toBe("log"); // bad_timing → log, by the taxonomy
    const edit = rows.find((r) => r.arm === "method" && r.caseId === "fb_04")!.result as { method: string | null; actualCategory: string | null };
    expect(edit.method).toBe("rule");
    expect(edit.actualCategory).not.toBeNull();
  });
});

describe("grounding audit runner", () => {
  it("compares verify.ts with every hand-labeled factual claim", () => {
    const rows = runGroundingAudit();
    expect(rows).toHaveLength(12);
    const claims = rows.flatMap((r) => (r.result as { claims: unknown[] }).claims);
    expect(claims).toHaveLength(29); // 30 labeled sentences, 1 non-factual excluded
  });
});

describe("grounding runner (live only)", () => {
  const draft = { insight: "i", subject: "s", sentences: [{ text: "Hi,", factIds: [], factual: false }, { text: "All 140 seats are live.", factIds: ["f_bf_seats"], factual: true }, { text: "Best, Maya", factIds: [], factual: false }] };
  const baseline = { insight: "i", subject: "s", body: "Hi,\nAll 140 seats are live.\nBest, Maya", sources: ["f_bf_seats"] };
  const model: ModelCall = async ({ schema }) => ({ output: schema.safeParse(draft).success ? draft : baseline, finishReason: "stop", model: "claude-opus-5-5" });

  it("refuses to run without the live model", async () => {
    expect(await runGrounding({ mode: "fixture", callModel: model }, 1)).toEqual({ ok: false, reason: "the grounding experiment needs LLM_MODE=live and an Anthropic key" });
  });

  it("runs both arms on every account and counts claims", async () => {
    const r = await runGrounding({ mode: "live", callModel: model }, 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value).toHaveLength(6); // 3 accounts × 1 run × 2 arms
    expect(r.value.every((x) => !x.isSynthetic)).toBe(true);
    expect(r.value.find((x) => x.arm === "method")!.result).toMatchObject({ factualClaims: 1, noneClaims: 0 });
  });

  it("records a failed generation instead of dropping it", async () => {
    const r = await runGrounding({ mode: "live", callModel: async () => { throw new Error("overloaded"); } }, 1);
    expect(r.ok && r.value.every((x) => (x.result as { failed?: boolean }).failed === true)).toBe(true);
  });
});

describe("runExperiment", () => {
  let db: Db;
  beforeEach(async () => {
    db = await openMemoryDb();
    await resetDemo(db);
  });
  it("replaces the previous run's rows instead of mixing runs", async () => {
    await runExperiment(db, "autonomy");
    await runExperiment(db, "autonomy");
    expect(await db.select().from(t.experimentRuns).where(eq(t.experimentRuns.experiment, "autonomy"))).toHaveLength(180);
  });
});
