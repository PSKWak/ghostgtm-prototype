import { describe, expect, it } from "vitest";
import { intervalsOverlap, wilson } from "@/lib/metrics/stats";

// Expected values computed by hand with the Wilson formula (z = 1.96).
describe("wilson", () => {
  it("matches hand-computed intervals", () => {
    const [lo, hi] = wilson(14, 18)!;
    expect(lo).toBeCloseTo(0.5478, 3);
    expect(hi).toBeCloseTo(0.9100, 3);
    expect(wilson(4, 17)!.map((x) => Number(x.toFixed(4)))).toEqual([0.0955, 0.4726]);
  });
  it("stays inside [0, 1] at the extremes", () => {
    expect(wilson(0, 10)![0]).toBe(0);
    expect(wilson(0, 10)![1]).toBeCloseTo(0.2775, 3);
    expect(wilson(10, 10)![1]).toBe(1);
  });
  it("has no interval for an empty denominator", () => {
    expect(wilson(0, 0)).toBeUndefined();
  });
});

describe("intervalsOverlap", () => {
  it("detects overlap and separation", () => {
    expect(intervalsOverlap([0.1, 0.4], [0.35, 0.9])).toBe(true);
    expect(intervalsOverlap([0.0955, 0.4726], [0.5478, 0.91])).toBe(false);
  });
});
