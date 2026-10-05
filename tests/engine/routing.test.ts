import { describe, expect, it } from "vitest";
import { routeFeedback } from "@/lib/engine/routing";

describe("routeFeedback", () => {
  it("sends fact problems to the graph", () => {
    expect(routeFeedback({ kind: "edit", category: "fact_correction" })).toBe("graph");
    expect(routeFeedback({ kind: "edit", category: "missing_context" })).toBe("graph");
    expect(routeFeedback({ kind: "reject", reason: "wrong_fact" })).toBe("graph");
  });
  it("sends wording and action choice to the prompt, safety to policy, timing to the log", () => {
    expect(routeFeedback({ kind: "edit", category: "style" })).toBe("prompt");
    expect(routeFeedback({ kind: "reject", reason: "wrong_action" })).toBe("prompt");
    expect(routeFeedback({ kind: "edit", category: "risk_removal" })).toBe("policy");
    expect(routeFeedback({ kind: "reject", reason: "too_risky" })).toBe("policy");
    expect(routeFeedback({ kind: "reject", reason: "bad_timing" })).toBe("log");
  });
});
