import { describe, expect, it } from "vitest";
import { METRICS, onlyReal } from "@/lib/metrics/definitions";
import type { BlockRow, DecisionRow, MetricRows } from "@/lib/metrics/types";

// RUBBER_STAMP_MS = 4000. Fixture of 11 decisions + 2 shield blocks:
//  id   kind            reviewMs  synthetic  edits (category/severity)              workflow
//  d1   approved_clean   20000                                                       completed
//  d2   approved_clean    2000                (rubber stamp)                          completed
//  d3   approved_clean   30000    yes                                                completed
//  d4   approved_edited  25000                fact_correction/critical               completed
//  d5   approved_edited  18000                style/minor                            completed
//  d6   approved_edited  22000                fact_correction/major, style/minor     failed
//  d7   rejected          9000                wrong_fact
//  d8   rejected          5000                too_risky
//  d9   rejected          7000    yes         wrong_fact
//  d10  ignored              0
//  d11  approved_clean    3000    yes         (rubber stamp)                          completed
//  b1   shield block (real), b2 shield block (synthetic)
const d = (id: string, kind: DecisionRow["kind"], reviewMs: number, over: Partial<DecisionRow> = {}): DecisionRow => ({
  id, workflowId: `wf_${id}`, kind, rejectReason: null, reviewMs, decidedAt: `2026-10-0${Math.min(9, Number(id.slice(1)))}T00:00:00Z`,
  isSynthetic: false, editCategories: [], editSeverities: [], workflowState: kind === "rejected" ? "rejected" : "completed", ...over,
});
const decisions: DecisionRow[] = [
  d("d1", "approved_clean", 20000), d("d2", "approved_clean", 2000), d("d3", "approved_clean", 30000, { isSynthetic: true }),
  d("d4", "approved_edited", 25000, { editCategories: ["fact_correction"], editSeverities: ["critical"] }),
  d("d5", "approved_edited", 18000, { editCategories: ["style"], editSeverities: ["minor"] }),
  d("d6", "approved_edited", 22000, { editCategories: ["fact_correction", "style"], editSeverities: ["major", "minor"], workflowState: "failed" }),
  d("d7", "rejected", 9000, { rejectReason: "wrong_fact" }), d("d8", "rejected", 5000, { rejectReason: "too_risky" }),
  d("d9", "rejected", 7000, { rejectReason: "wrong_fact", isSynthetic: true }), d("d10", "ignored", 0, { workflowState: "awaiting_approval" }),
  d("d11", "approved_clean", 3000, { isSynthetic: true }),
];
const blocks: BlockRow[] = [{ id: "b1", at: "2026-10-05T00:00:00Z", isSynthetic: false }, { id: "b2", at: "2026-10-05T00:00:00Z", isSynthetic: true }];
const rows: MetricRows = { decisions, blocks, executions: [], generateRuns: [], replays: [], experiments: [] };
const empty: MetricRows = { decisions: [], blocks: [], executions: [], generateRuns: [], replays: [], experiments: [] };
const m = (id: string, r: MetricRows = rows) => METRICS.find((x) => x.id === id)!.compute(r);

describe("clean_approval_rate", () => {
  // decided = d1..d9 + d11 = 10 (d10 ignored excluded); clean & read (>= 4000ms) = d1, d3 → 2/10
  it("counts read clean approvals over decided", () => expect(m("clean_approval_rate")).toMatchObject({ numerator: 2, denominator: 10, value: 0.2, realCount: 7, syntheticCount: 3 }));
  // real only: decided = d1,d2,d4,d5,d6,d7,d8 = 7; clean & read = d1 → 1/7
  it("respects real-only", () => expect(m("clean_approval_rate", onlyReal(rows))).toMatchObject({ numerator: 1, denominator: 7 }));
  it("is null on an empty denominator", () => expect(m("clean_approval_rate", empty)).toMatchObject({ value: null, denominator: 0, ci95: undefined }));
});

describe("fact_correction_rate", () => {
  // approved = d1,d2,d3,d4,d5,d6,d11 = 7; with ≥1 fact_correction = d4, d6 → 2/7
  it("counts approvals that needed a fact fix", () => expect(m("fact_correction_rate")).toMatchObject({ numerator: 2, denominator: 7 }));
});

describe("rubber_stamp_rate", () => {
  // clean approvals = d1,d2,d3,d11 = 4; under 4000ms = d2, d11 → 2/4, but n=4 < minSample 5 → value null
  it("is withheld below the minimum sample but keeps its counts", () => expect(m("rubber_stamp_rate")).toMatchObject({ numerator: 2, denominator: 4, value: null }));
});

describe("reject_reason_mix", () => {
  // rejects = d7, d8, d9 = 3; wrong_fact 2, too_risky 1; headline = most common reason 2/3
  it("breaks rejects down by reason", () => {
    const r = m("reject_reason_mix");
    expect(r).toMatchObject({ numerator: 2, denominator: 3 });
    expect(r.breakdown?.map((b) => [b.key, b.numerator, b.denominator])).toEqual([["wrong_fact", 2, 3], ["too_risky", 1, 3]]);
  });
});

describe("completion_rate", () => {
  // approved = 7; completed among them = d1,d2,d3,d4,d5,d11 = 6 (d6 failed) → 6/7
  it("counts completed over approved", () => expect(m("completion_rate")).toMatchObject({ numerator: 6, denominator: 7 }));
});

describe("critical_error_count", () => {
  // real events (decisions + blocks) = d1,d2,d4,d5,d6,d7,d8,d10 + b1 = 9 (≤ 20); critical edits: d4; shield blocks: b1 → 2
  it("counts critical edits and shield blocks in the last 20 real events, ignoring synthetic", () =>
    expect(m("critical_error_count")).toMatchObject({ value: 2, numerator: 2, denominator: 9, syntheticCount: 0 }));
  it("is zero, not missing, when there are no events", () => expect(m("critical_error_count", empty)).toMatchObject({ value: 0, denominator: 0 }));
});

describe("all-synthetic data", () => {
  const synthetic = { ...rows, decisions: decisions.map((x) => ({ ...x, isSynthetic: true })) };
  it("reports zero real rows", () => expect(m("clean_approval_rate", synthetic)).toMatchObject({ realCount: 0, syntheticCount: 10 }));
  it("has nothing left under real-only", () => expect(m("clean_approval_rate", onlyReal(synthetic))).toMatchObject({ value: null, denominator: 0 }));
});
