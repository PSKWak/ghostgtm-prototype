import { describe, expect, it } from "vitest";
import { classifyEdits, diffBody } from "@/lib/engine/diff";
import type { Claim, Draft, Fact } from "@/lib/engine/types";

const fact = (id: string, value: string): Fact => ({
  id, accountId: "a", key: id, value, source: "crm_explicit", sourceRef: "x",
  observedAt: "2026-01-01T00:00:00Z", supersededBy: null, supersededReason: null,
});
const facts = [fact("renewal", "2027-03-31"), fact("approver", "Petra Novak"), fact("seats", "140")];

const c = (id: string, sentence: string, factIds: string[] = [], factual = true): Claim => ({ id, sentence, factIds, factual });
const draft: Draft = {
  subject: "Follow-up",
  claims: [
    c("greet", "Hi Dana, thanks so much for your time today.", [], false),
    c("renew", "Your renewal is coming up in March 2027.", ["renewal"]),
    c("seats", "All 140 seats are live.", ["seats"]),
    c("approver", "Petra Novak signs off on the budget.", ["approver"]),
  ],
};
const body = (...parts: string[]) => parts.join(" ");
const [greet, renew, seats, approver] = draft.claims.map((x) => x.sentence) as [string, string, string, string];

describe("diffBody", () => {
  it("returns nothing for an unchanged body", () => {
    expect(diffBody(draft, body(greet, renew, seats, approver))).toEqual([]);
  });

  it("merges nearby word changes into one span and attributes it to the claim", () => {
    const spans = diffBody(draft, body(greet, "Your renewal is coming up on December 31, 2026.", seats, approver));
    expect(spans).toEqual([{ claimId: "renew", before: "in March 2027.", after: "on December 31, 2026." }]);
  });

  it("keeps changes more than two words apart as separate spans", () => {
    const spans = diffBody(draft, body("Hello Dana, thanks so much for your time.", renew, seats, approver));
    expect(spans.map((s) => s.before)).toEqual(["Hi", "time today."]);
  });

  it("attributes a pure insertion to the preceding claim", () => {
    const spans = diffBody(draft, body(greet, renew, "All 140 seats are now live.", approver));
    expect(spans).toEqual([{ claimId: "seats", before: "", after: "now" }]);
  });
});

describe("classifyEdits", () => {
  const classify = (after: string) => classifyEdits(diffBody(draft, after), draft, facts);

  it("classifies a changed date that matched a cited fact as a critical fact correction", () => {
    const r = classify(body(greet, "Your renewal is coming up on December 31, 2026.", seats, approver));
    expect(r.leftover).toEqual([]);
    expect(r.classified).toEqual([expect.objectContaining({
      category: "fact_correction", severity: "critical", method: "rule", factId: "renewal",
    })]);
  });

  it("reads a day-only change as a correction of the whole cited date", () => {
    // Found on production: "October 12, 2026" → "October 19, 2026" diffs to "12," → "19,", a bare
    // number that matches no fact, so the rep's fix was refused instead of proposed.
    const d: Draft = { subject: "s", claims: [c("call", "Let's meet the week of October 12, 2026.", ["next"])] };
    const next = fact("next", "Security review call, week of October 12, 2026");
    const r = classifyEdits(diffBody(d, "Let's meet the week of October 19, 2026."), d, [next]);
    expect(r.classified).toEqual([expect.objectContaining({
      category: "fact_correction", severity: "critical", factId: "next", before: "October 12, 2026", after: "October 19, 2026",
    })]);
  });

  it("classifies a changed name that matched a cited fact as a major fact correction", () => {
    const r = classify(body(greet, renew, seats, "Tomas Hruby signs off on the budget."));
    expect(r.classified).toEqual([expect.objectContaining({ category: "fact_correction", severity: "major", factId: "approver" })]);
  });

  it("classifies a changed number with no backing fact as a fact correction without a fact id", () => {
    const d: Draft = { subject: "s", claims: [c("x", "We saw 18% gains.", [])] };
    const r = classifyEdits(diffBody(d, "We saw 12% gains."), d, facts);
    expect(r.classified[0]).toMatchObject({ category: "fact_correction", factId: null, severity: "major" });
  });

  it("leaves a removed sentence unclassified rather than calling it a correction", () => {
    const r = classify(body(greet, renew, approver));
    expect(r.classified).toEqual([]);
    expect(r.leftover).toEqual([{ claimId: "seats", before: seats, after: "" }]);
  });

  it("leaves wording changes for the LLM pass", () => {
    const r = classify(body("Hi Dana, thanks for your time today.", renew, seats, approver));
    expect(r.classified).toEqual([]);
    expect(r.leftover).toEqual([{ claimId: "greet", before: "so much", after: "" }]);
  });
});
