import { describe, expect, it } from "vitest";
import { classifyLeftovers } from "@/lib/llm/classify";
import type { ModelCall } from "@/lib/llm/model";

const spans = [
  { claimId: "a", before: "Thanks a ton", after: "Thank you" },
  { claimId: "b", before: "", after: "Jordan Lee will join on May 4." },
];
const model = (output: unknown): ModelCall => async () => ({ output, finishReason: "stop", model: "claude-opus-5-5" });

describe("classifyLeftovers", () => {
  it("uses the rules in fixture mode and logs no LLM run", async () => {
    const r = await classifyLeftovers(spans, { mode: "fixture", callModel: model(null) });
    expect(r.run).toBeNull();
    expect(r.labels.map((l) => [l.category, l.method])).toEqual([["style", "rule"], ["missing_context", "rule"]]);
  });

  it("uses the model's labels when they parse, marked as llm", async () => {
    const r = await classifyLeftovers(spans, { mode: "live", callModel: model({ labels: [
      { index: 0, category: "style", severity: "minor", reason: "tone" },
      { index: 1, category: "missing_context", severity: "major", reason: "new attendee" },
    ] }) });
    expect(r.labels.map((l) => l.method)).toEqual(["llm", "llm"]);
    expect(r.run).toMatchObject({ parseOk: true, promptVersion: "classify_edit@v1" });
  });

  it("fills an edit the model skipped from the rules", async () => {
    const r = await classifyLeftovers(spans, { mode: "live", callModel: model({ labels: [{ index: 1, category: "missing_context", severity: "major", reason: "x" }] }) });
    expect(r.labels.map((l) => l.method)).toEqual(["rule", "llm"]);
  });

  it("falls back to the rules on bad output or an error, and logs the failure", async () => {
    const bad = await classifyLeftovers(spans, { mode: "live", callModel: model({ labels: "nope" }) });
    expect(bad.run?.parseOk).toBe(false);
    expect(bad.labels.every((l) => l.method === "rule")).toBe(true);
    const thrown = await classifyLeftovers(spans, { mode: "live", callModel: async () => { throw new Error("rate limited"); } });
    expect(thrown.run).toMatchObject({ parseOk: false, error: "rate limited" });
  });
});
