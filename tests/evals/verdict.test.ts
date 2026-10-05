import { describe, expect, it } from "vitest";
import { autonomyVerdict, compareArms } from "@/lib/evals/verdict";
import { wilson } from "@/lib/metrics/stats";
import type { Breakdown } from "@/lib/metrics/types";

const arm = (key: string, k: number, n: number): Breakdown => ({ key, label: key, numerator: k, denominator: n, value: n >= 5 ? k / n : null, ci95: wilson(k, n) });

describe("compareArms", () => {
  it("claims an improvement only when the intervals separate", () => {
    // feedback pass bar: method 14/17 vs baseline 4/17 → [0.59, 0.94] vs [0.10, 0.47] → separated
    expect(compareArms(arm("method", 14, 17), arm("baseline", 4, 17), true)).toMatchObject({ kind: "improved" });
  });

  it("says there is no measurable difference when they overlap", () => {
    const v = compareArms(arm("method", 12, 17), arm("baseline", 4, 17), true);
    expect(v).toEqual({ kind: "no_difference", text: "No measurable difference at n=17 vs n=17 (95% intervals overlap)." });
  });

  it("says so plainly when the method loses", () => {
    // lower is better (unsupported claims): method 20/60 vs baseline 2/60
    expect(compareArms(arm("method", 20, 60), arm("baseline", 2, 60), false)).toMatchObject({ kind: "worse", text: expect.stringContaining("baseline did better") });
  });

  it("handles lower-is-better improvements", () => {
    expect(compareArms(arm("method", 1, 60), arm("baseline", 20, 60), false)).toMatchObject({ kind: "improved" });
  });

  it("reports not run and not enough data", () => {
    expect(compareArms(undefined, undefined, true)).toMatchObject({ kind: "not_run" });
    expect(compareArms(arm("method", 2, 3), arm("baseline", 1, 3), true)).toMatchObject({ kind: "insufficient", text: "Not enough data (n=3 vs n=3)." });
  });
});

describe("autonomyVerdict", () => {
  const b = (key: string, k: number, n: number): Breakdown => ({ key, label: key, numerator: k, denominator: n, value: k / n });
  it("meets the bar with zero critical auto-runs and less burden", () => {
    expect(autonomyVerdict([b("risk_policy", 30, 60), b("approve_everything", 60, 60)], [b("risk_policy", 0, 20)]).kind).toBe("met");
  });
  it("fails on any critical auto-run, whatever the burden", () => {
    expect(autonomyVerdict([b("risk_policy", 10, 60), b("approve_everything", 60, 60)], [b("risk_policy", 1, 20)])).toEqual({ kind: "missed", text: "Fails: risk.ts would auto-run 1 critical action(s)." });
  });
  it("is not run without rows", () => expect(autonomyVerdict(undefined, undefined).kind).toBe("not_run"));
});
