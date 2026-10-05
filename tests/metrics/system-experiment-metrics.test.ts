import { describe, expect, it } from "vitest";
import { METRICS } from "@/lib/metrics/definitions";
import type { ExperimentRow, MetricRows } from "@/lib/metrics/types";

const base: MetricRows = { decisions: [], blocks: [], executions: [], generateRuns: [], replays: [], experiments: [] };
const m = (id: string, r: Partial<MetricRows>) => METRICS.find((x) => x.id === id)!.compute({ ...base, ...r });

describe("write_fidelity", () => {
  // 6 executions, e6 wrote something other than the approved version → 5/6
  const executions = ["e1", "e2", "e3", "e4", "e5", "e6"].map((id) => ({ id, workflowId: "w", hashMatches: id !== "e6", isSynthetic: false }));
  it("counts executions whose hash matched the approved version", () => expect(m("write_fidelity", { executions })).toMatchObject({ numerator: 5, denominator: 6 }));
});

describe("grounding_pass_rate", () => {
  // first attempts: 5 live (g5 failed verify) + 2 fixture (excluded: the template is grounded by construction) → 4/5
  const generateRuns = [
    ...["g1", "g2", "g3", "g4"].map((id) => ({ id, mode: "live" as const, verifyPassedFirstTry: true, isSynthetic: false })),
    { id: "g5", mode: "live" as const, verifyPassedFirstTry: false, isSynthetic: false },
    { id: "f1", mode: "fixture" as const, verifyPassedFirstTry: true, isSynthetic: false },
    { id: "f2", mode: "fixture" as const, verifyPassedFirstTry: true, isSynthetic: false },
  ];
  it("counts live first tries that passed verify", () => expect(m("grounding_pass_rate", { generateRuns })).toMatchObject({ numerator: 4, denominator: 5, value: 0.8 }));
});

describe("replay_pass_rate", () => {
  // latest result per (test, version): generate@v1 → t1 pass (r2 replaced r1), t2 fail → 1/2; baseline → 2/2
  const replays = [
    { id: "r1", testCaseId: "t1", promptVersion: "generate@v1", passed: false, ranAt: "2026-10-01T00:00:00Z", isSynthetic: false },
    { id: "r2", testCaseId: "t1", promptVersion: "generate@v1", passed: true, ranAt: "2026-10-02T00:00:00Z", isSynthetic: false },
    { id: "r3", testCaseId: "t2", promptVersion: "generate@v1", passed: false, ranAt: "2026-10-01T00:00:00Z", isSynthetic: false },
    { id: "r4", testCaseId: "t1", promptVersion: "generate@baseline", passed: true, ranAt: "2026-10-01T00:00:00Z", isSynthetic: false },
    { id: "r5", testCaseId: "t2", promptVersion: "generate@baseline", passed: true, ranAt: "2026-10-01T00:00:00Z", isSynthetic: false },
  ];
  it("uses each test's latest result, per prompt version", () => {
    const r = m("replay_pass_rate", { replays });
    expect(r).toMatchObject({ numerator: 1, denominator: 2, rowIds: ["r2", "r3"] });
    expect(r.breakdown?.map((b) => [b.key, b.numerator, b.denominator])).toEqual([["generate@v1", 1, 2], ["generate@baseline", 2, 2]]);
  });

  it("splits real and synthetic tests (a test on a synthetic account is synthetic)", () => {
    // t1 real (r2 pass), t2 synthetic (r3 fail) → 1/2 overall, 1 real · 1 synthetic
    const mixed = replays.map((x) => (x.testCaseId === "t2" ? { ...x, isSynthetic: true } : x));
    expect(m("replay_pass_rate", { replays: mixed })).toMatchObject({ numerator: 1, denominator: 2, realCount: 1, syntheticCount: 1 });
  });
});

const exp = (experiment: string, arm: string, caseId: string, result: object): ExperimentRow => ({ id: `${experiment}-${arm}-${caseId}`, experiment, arm, caseId, isSynthetic: true, result });

describe("unsupported_claim_rate", () => {
  // claim-level: method drafts have 10 factual claims, 1 none → 1/10; baseline 12 factual, 3 none → 3/12
  const experiments = [
    exp("grounding", "method", "a", { factualClaims: 6, noneClaims: 1 }), exp("grounding", "method", "b", { factualClaims: 4, noneClaims: 0 }),
    exp("grounding", "baseline", "a", { factualClaims: 7, noneClaims: 2 }), exp("grounding", "baseline", "b", { factualClaims: 5, noneClaims: 1 }),
  ];
  it("counts unsupported claims per arm", () => {
    const r = m("unsupported_claim_rate", { experiments });
    expect(r).toMatchObject({ numerator: 1, denominator: 10 });
    expect(r.breakdown?.find((b) => b.key === "baseline")).toMatchObject({ numerator: 3, denominator: 12 });
  });
  it("is empty before any run", () => expect(m("unsupported_claim_rate", {})).toMatchObject({ value: null, denominator: 0 }));
});

describe("routing_accuracy and classifier_accuracy", () => {
  // 6 cases. method: 5 correct routes; baseline (all → prompt): 2 correct. Classifier: 4 labeled edits, 3 correct.
  const f = (arm: string, id: string, expectedRoute: string, actualRoute: string, expectedCategory: string | null = null, actualCategory: string | null = null) =>
    exp("feedback", arm, id, { expectedRoute, actualRoute, expectedCategory, actualCategory, method: actualCategory ? "rule" : null, proposalExpected: false, proposalMade: false });
  const experiments = [
    f("method", "c1", "graph", "graph", "fact_correction", "fact_correction"), f("method", "c2", "prompt", "prompt", "style", "style"),
    f("method", "c3", "graph", "graph", "missing_context", "missing_context"), f("method", "c4", "policy", "prompt", "risk_removal", "style"),
    f("method", "c5", "log", "log"), f("method", "c6", "prompt", "prompt"),
    ...["c1", "c2", "c3", "c4", "c5", "c6"].map((id, i) => f("baseline", id, ["graph", "prompt", "graph", "policy", "log", "prompt"][i]!, "prompt")),
  ];
  it("compares routing per arm", () => {
    const r = m("routing_accuracy", { experiments });
    expect(r).toMatchObject({ numerator: 5, denominator: 6 });
    expect(r.breakdown?.find((b) => b.key === "baseline")).toMatchObject({ numerator: 2, denominator: 6 });
  });
  it("scores the classifier on labeled edits with a confusion matrix", () => {
    const r = m("classifier_accuracy", { experiments });
    expect(r).toMatchObject({ numerator: 3, denominator: 4, value: null }); // n=4 < minSample 5
    const i = (l: string) => r.matrix!.labels.indexOf(l);
    expect(r.matrix!.counts[i("risk_removal")]![i("style")]).toBe(1);
  });
});

describe("proposal_accuracy", () => {
  // 4 cases expect a proposal; method made 3 of them, baseline (approve/reject only) made none → 3/4 and 0/4
  const p = (arm: string, id: string, proposalExpected: boolean, proposalMade: boolean) =>
    exp("feedback", arm, id, { expectedRoute: "graph", actualRoute: "graph", expectedCategory: null, actualCategory: null, method: null, proposalExpected, proposalMade });
  const experiments = [
    p("method", "p1", true, true), p("method", "p2", true, true), p("method", "p3", true, true), p("method", "p4", true, false), p("method", "p5", false, false),
    ...["p1", "p2", "p3", "p4"].map((id) => p("baseline", id, true, false)),
  ];
  it("counts expected fact corrections that were proposed", () => {
    const r = m("proposal_accuracy", { experiments });
    expect(r).toMatchObject({ numerator: 3, denominator: 4, value: 0.75 });
    expect(r.breakdown?.find((b) => b.key === "baseline")).toMatchObject({ numerator: 0, denominator: 4 });
  });
});

describe("human_burden and critical_auto_executed", () => {
  // 5 actions (2 critical). risk_policy auto-runs a3, a4 (not critical) → burden 3/5, critical auto 0.
  // confidence_only auto-runs a1 (critical), a3, a4 → burden 2/5, critical auto 1.
  const a = (arm: string, id: string, critical: boolean, autoRun: boolean) => exp("autonomy", arm, id, { critical, needsHuman: critical, autoRun });
  const experiments = [
    a("risk_policy", "a1", true, false), a("risk_policy", "a2", true, false), a("risk_policy", "a3", false, true), a("risk_policy", "a4", false, true), a("risk_policy", "a5", false, false),
    a("confidence_only", "a1", true, true), a("confidence_only", "a2", true, false), a("confidence_only", "a3", false, true), a("confidence_only", "a4", false, true), a("confidence_only", "a5", false, false),
  ];
  it("measures review burden per policy", () => {
    const r = m("human_burden", { experiments });
    expect(r).toMatchObject({ numerator: 3, denominator: 5, value: 0.6 });
    expect(r.breakdown?.find((b) => b.key === "confidence_only")).toMatchObject({ numerator: 2, denominator: 5 });
  });
  it("counts critical actions each policy would auto-run", () => {
    const r = m("critical_auto_executed", { experiments });
    expect(r).toMatchObject({ value: 0 });
    expect(r.breakdown?.find((b) => b.key === "confidence_only")).toMatchObject({ numerator: 1 });
  });
});

describe("judge_agreement", () => {
  // 2 audited drafts, 5 labeled claims, verify.ts agreed on 4
  const experiments = [
    exp("grounding_audit", "verify", "gl_01", { claims: [{ expected: "supported", actual: "supported" }, { expected: "partial", actual: "supported" }] }),
    exp("grounding_audit", "verify", "gl_02", { claims: [{ expected: "none", actual: "none" }, { expected: "stale", actual: "stale" }, { expected: "supported", actual: "supported" }] }),
  ];
  it("counts claims where verify.ts matched the human label", () => expect(m("judge_agreement", { experiments })).toMatchObject({ numerator: 4, denominator: 5, value: 0.8 }));
});
