import { describe, expect, it } from "vitest";
import { verifyDraft } from "@/lib/engine/verify";
import type { Claim, Fact } from "@/lib/engine/types";

const fact = (id: string, value: string | null, supersededBy: string | null = null): Fact => ({
  id, accountId: "a", key: id, value, source: "crm_explicit", sourceRef: "x",
  observedAt: "2026-01-01T00:00:00Z", supersededBy, supersededReason: supersededBy ? "crm_explicit outranks ai_inferred" : null,
});

const facts = [
  fact("renewal", "2027-03-31"),
  fact("renewal_old", "2026-12-31", "renewal"),
  fact("seats", "140"),
  fact("budget", null),
  fact("request", "SOC 2 Type II report and API rate-limit doc"),
  fact("approver", "Tomas Hruby"),
];

const claim = (sentence: string, factIds: string[], factual = true): Claim => ({ id: "c1", sentence, factIds, factual });
const labelOf = (c: Claim) => verifyDraft({ subject: "s", claims: [c] }, facts).verdicts[0];

describe("verifyDraft", () => {
  it("supports a claim whose values all match its cited facts", () => {
    expect(labelOf(claim("Your renewal is in March 2027.", ["renewal"]))?.label).toBe("supported");
  });

  it("labels a claim with no citation as none (rule 5)", () => {
    expect(labelOf(claim("All 140 seats are live.", []))).toMatchObject({ label: "none", reason: "no citation" });
  });

  it("labels a citation to a fact that was not in the input as none", () => {
    expect(labelOf(claim("All 140 seats are live.", ["made_up"]))).toMatchObject({ label: "none", reason: "cites fact not in input: made_up" });
  });

  it("labels a claim citing a superseded fact as stale", () => {
    expect(labelOf(claim("Your renewal is December 31, 2026.", ["renewal_old"]))?.label).toBe("stale");
  });

  it("labels partial when only some values match", () => {
    expect(labelOf(claim("All 140 seats renew in March 2027.", ["seats"]))).toMatchObject({ label: "partial", reason: "unmatched: March 2027" });
  });

  it("labels none when no value matches the cited fact", () => {
    expect(labelOf(claim("All 200 seats are live.", ["seats"]))?.label).toBe("none");
  });

  it("keeps unknown values unknown (rule 5)", () => {
    expect(labelOf(claim("The budget owner is still unknown.", ["budget"]))?.label).toBe("supported");
    expect(labelOf(claim("Priya owns the budget.", ["budget"]))).toMatchObject({ label: "none", reason: "asserts a value for unknown fact budget" });
  });

  it("accepts a cited claim with no checkable values, and skips non-factual sentences", () => {
    expect(labelOf(claim("I've attached the SOC 2 Type II report.", ["request"]))?.label).toBe("supported");
    const r = verifyDraft({ subject: "s", claims: [claim("Hi Dana,", [], false)] }, facts);
    expect(r.verdicts).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it("flags a sentence that cites a person but names someone else", () => {
    expect(labelOf(claim("I'll address it to Tomas Hruby.", ["approver"]))?.label).toBe("supported");
    expect(labelOf(claim("I'll address it to Petra Novak.", ["approver"]))).toMatchObject({ label: "partial", reason: "doesn't name Tomas Hruby (from approver)" });
  });

  it("passes only when every factual claim is supported", () => {
    const r = verifyDraft({ subject: "s", claims: [
      { ...claim("Your renewal is in March 2027.", ["renewal"]), id: "a" },
      { ...claim("All 200 seats are live.", ["seats"]), id: "b" },
    ] }, facts);
    expect(r.passed).toBe(false);
    expect(r.verdicts.map((v) => v.claimId)).toEqual(["a", "b"]);
  });
});
