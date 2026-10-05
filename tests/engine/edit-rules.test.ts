import { describe, expect, it } from "vitest";
import { classifyLeftover } from "@/lib/engine/edit-rules";

// Examples written independently of experiments/feedback.labels.json, which is the
// held-out test set for the feedback experiment.
const span = (before: string, after: string) => ({ claimId: "c", before, after });

describe("classifyLeftover (rule fallback for edits the diff could not classify)", () => {
  it("calls removing a sales pitch a risk removal", () => {
    expect(classifyLeftover(span("We'd also love to discuss a bigger license tier.", ""))).toMatchObject({ category: "risk_removal", severity: "major", method: "rule" });
    expect(classifyLeftover(span("and our discount for early renewal", "and our timeline"))).toMatchObject({ category: "risk_removal" });
  });

  it("calls removing an ordinary sentence a style edit", () => {
    expect(classifyLeftover(span("It was a pleasure chatting.", ""))).toMatchObject({ category: "style", severity: "minor" });
  });

  it("calls adding new figures, dates or names missing context", () => {
    expect(classifyLeftover(span("", "Jordan Lee from finance will join on May 4."))).toMatchObject({ category: "missing_context", severity: "major" });
    expect(classifyLeftover(span("the logs", "the logs and the 3 audit exports"))).toMatchObject({ category: "missing_context" });
  });

  it("calls swapping one kind of next step for another an action change", () => {
    expect(classifyLeftover(span("set up a demo", "set up a workshop"))).toMatchObject({ category: "action_change", severity: "major" });
  });

  it("calls everything else wording", () => {
    expect(classifyLeftover(span("Thanks a ton", "Thank you"))).toMatchObject({ category: "style", severity: "minor" });
    expect(classifyLeftover(span("I'll", "I will"))).toMatchObject({ category: "style" });
  });

  it("always gives a reason", () => {
    expect(classifyLeftover(span("a", "b")).reason.length).toBeGreaterThan(0);
  });
});
