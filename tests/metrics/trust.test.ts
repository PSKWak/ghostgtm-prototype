import { describe, expect, it } from "vitest";
import { computeTrustLevel } from "@/lib/metrics/trust";
import type { DecisionRow, ExecutionRow, MetricRows } from "@/lib/metrics/types";

const clean = (i: number, over: Partial<DecisionRow> = {}): DecisionRow => ({
  id: `d${i}`, workflowId: `wf_${i}`, kind: "approved_clean", rejectReason: null, reviewMs: 20_000,
  decidedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), isSynthetic: false, editCategories: [], editSeverities: [], workflowState: "completed", ...over,
});
const execs = (n: number): ExecutionRow[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, workflowId: `wf_${i}`, hashMatches: true, isSynthetic: false }));
const rows = (decisions: DecisionRow[], over: Partial<MetricRows> = {}): MetricRows =>
  ({ decisions, blocks: [], executions: execs(decisions.length), generateRuns: [], replays: [], experiments: [], ...over });
const many = (n: number, over: Partial<DecisionRow> = {}) => Array.from({ length: n }, (_, i) => clean(i + 1, over));

describe("computeTrustLevel", () => {
  it("starts at level 0 and shows what's missing", () => {
    const t = computeTrustLevel(rows([]));
    expect(t.level).toBe(0);
    expect(t.gates.find((g) => g.level === 1 && g.label.startsWith("Real decisions"))).toMatchObject({ required: "≥ 10", actual: "0", pass: false });
  });

  it("reaches level 1 with 12 read clean approvals", () => expect(computeTrustLevel(rows(many(12))).level).toBe(1));

  it("reaches level 2 with 25, and stops at 2 without 40", () => expect(computeTrustLevel(rows(many(25))).level).toBe(2));

  it("reaches level 3 only with 40+ decisions, perfect completion and write fidelity", () => {
    expect(computeTrustLevel(rows(many(45))).level).toBe(3);
    const oneMismatch = execs(45).map((e, i) => (i === 0 ? { ...e, hashMatches: false } : e));
    expect(computeTrustLevel(rows(many(45), { executions: oneMismatch })).level).toBe(2);
  });

  it("ignores synthetic decisions entirely", () => expect(computeTrustLevel(rows(many(45, { isSynthetic: true }))).level).toBe(0));

  it("drops one level for a critical edit in the last 20 and names it", () => {
    const decisions = [...many(24), clean(25, { kind: "approved_edited", editCategories: ["fact_correction"], editSeverities: ["critical"], workflowId: "wf_812" })];
    const t = computeTrustLevel(rows(decisions));
    expect(t.earned).toBe(2);
    expect(t.level).toBe(1);
    expect(t.drop).toEqual({ reason: "critical edit (fact correction)", workflowId: "wf_812" });
    expect(t.gates.find((g) => g.label.startsWith("Critical errors"))).toMatchObject({ required: "= 0", actual: "1", pass: false, detail: "critical edit (fact correction), wf_812" });
  });

  it("drops one level for a shield block and names the workflow", () => {
    const t = computeTrustLevel(rows(many(12), { blocks: [{ id: "wf_900", at: "2026-10-02T00:00:00Z", isSynthetic: false }] }));
    expect(t).toMatchObject({ earned: 1, level: 0, drop: { reason: "shield block", workflowId: "wf_900" } });
  });
});
