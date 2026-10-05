import { describe, expect, it } from "vitest";
import { describeExperimentRow } from "@/lib/db/views/describe-experiment-row";

describe("describeExperimentRow", () => {
  it("shows an audited claim with both labels and whether the judge agreed", () => {
    const row = { experiment: "grounding_audit", arm: "verify", caseId: "gl_03", result: { claims: [
      { sentence: "All 140 seats went live in September.", expected: "partial", actual: "partial", reason: "unmatched: September" },
      { sentence: "Penetration test results attached.", expected: "partial", actual: "supported", reason: "citation valid; no checkable values" },
    ] } };
    expect(describeExperimentRow(row, 0)).toBe('"All 140 seats went live in September." · human label: partial · verify.ts: partial ✓ · why: unmatched: September');
    expect(describeExperimentRow(row, 1)).toContain("verify.ts: supported ✗");
  });

  it("shows a feedback case's route, label and proposal against what was expected", () => {
    const row = { experiment: "feedback", arm: "method", caseId: "fb_06", result: { expectedRoute: "graph", actualRoute: "prompt", expectedCategory: "missing_context", actualCategory: "style", method: "rule", proposalExpected: false, proposalMade: false } };
    expect(describeExperimentRow(row)).toBe("feedback · method · case fb_06 · routed to prompt (expected graph) ✗ · edit labeled style by rule (expected missing context) ✗");
  });

  it("marks a critical action that would auto-run as a failure", () => {
    const risky = { experiment: "autonomy", arm: "confidence_only", caseId: "au_33", result: { critical: true, needsHuman: true, autoRun: true, confidence: 0.96 } };
    expect(describeExperimentRow(risky)).toBe("autonomy · confidence only · case au_33 · critical action · would auto-run (confidence 0.96) ✗");
    const held = { experiment: "autonomy", arm: "risk_policy", caseId: "au_33", result: { critical: true, needsHuman: true, autoRun: false, rule: "commercial_during_escalation", reason: "commercial asks are paused" } };
    expect(describeExperimentRow(held)).toContain("needs a person (commercial_during_escalation: commercial asks are paused) ✓");
  });

  it("describes grounding runs, including failed generations", () => {
    expect(describeExperimentRow({ experiment: "grounding", arm: "method", caseId: "acct_ostrava#3", result: { factualClaims: 5, noneClaims: 1, attempts: 2, model: "openai/gpt-oss-120b" } }))
      .toBe("grounding · method · case acct_ostrava#3 · 5 factual claims, 1 unsupported · 2 attempt(s) · openai/gpt-oss-120b");
    expect(describeExperimentRow({ experiment: "grounding", arm: "baseline", caseId: "x#0", result: { failed: true, error: "overloaded" } })).toContain("generation failed: overloaded");
  });

  it("falls back to a plain header for a shape it doesn't know", () => {
    expect(describeExperimentRow({ experiment: "other", arm: "a", caseId: "c1", result: { nope: 1 } })).toBe("other · a · case c1");
  });
});
