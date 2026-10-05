import { describe, expect, it } from "vitest";
import { applyClaimEdits, reciteClaims } from "@/lib/engine/draft-edit";
import { checkExpectation, expectationFor } from "@/lib/engine/replay";
import type { Draft } from "@/lib/engine/types";

const draft: Draft = {
  subject: "s",
  claims: [
    { id: "hi", sentence: "Hi Dana,", factIds: [], factual: false },
    { id: "renew", sentence: "I have your renewal down for March 31, 2027.", factIds: ["f_crm"], factual: true },
  ],
};

describe("draft edits", () => {
  const edit = (edits: { id: string; sentence: string }[]) => {
    const r = applyClaimEdits(draft, edits);
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };

  it("replaces edited sentences and keeps citations", () => {
    const edited = edit([{ id: "renew", sentence: " I have your renewal down for December 31, 2026. " }]);
    expect(edited.claims[1]).toEqual({ id: "renew", sentence: "I have your renewal down for December 31, 2026.", factIds: ["f_crm"], factual: true });
    expect(draft.claims[1]?.sentence).toContain("March"); // input untouched
  });

  it("removes a sentence the rep clears", () => {
    const withExtra: Draft = { ...draft, claims: [...draft.claims, { id: "x", sentence: "All 140 seats are live.", factIds: ["f"], factual: true }] };
    const r = applyClaimEdits(withExtra, [{ id: "x", sentence: "   " }]);
    expect(r.ok && r.value.claims.map((c) => c.id)).toEqual(["hi", "renew"]);
  });

  it("refuses to clear every factual sentence", () => {
    expect(applyClaimEdits(draft, [{ id: "renew", sentence: "" }])).toEqual({ ok: false, reason: "the draft has no factual sentences left to send" });
  });

  it("treats a greeting that now states a figure as an uncited factual claim (rule 5)", () => {
    expect(edit([{ id: "hi", sentence: "Hi Dana, you're getting 40% off," }]).claims[0]).toMatchObject({ factual: true, factIds: [] });
    expect(edit([{ id: "hi", sentence: "Hello Dana," }]).claims[0]).toMatchObject({ factual: false });
  });

  it("refuses edits to sentences that don't exist", () => {
    expect(applyClaimEdits(draft, [{ id: "ghost", sentence: "x" }])).toEqual({ ok: false, reason: "unknown sentence id(s): ghost" });
  });

  it("re-cites claims to a replacement fact", () => {
    expect(reciteClaims(draft, new Map([["f_crm", "f_new"]])).claims[1]?.factIds).toEqual(["f_new"]);
  });
});

describe("regression expectation", () => {
  const e = expectationFor("renewal_date", "2026-12-31");

  it("is written the way a draft states it", () => {
    expect(e).toEqual({ factKey: "renewal_date", mustContain: "December 31, 2026" });
  });

  it("fails on the old draft and passes once the draft states the corrected value", () => {
    expect(checkExpectation(draft, e).passed).toBe(false);
    const fixed = applyClaimEdits(draft, [{ id: "renew", sentence: "I have your renewal down for December 31, 2026." }]);
    if (!fixed.ok) throw new Error(fixed.reason);
    expect(checkExpectation(fixed.value, e)).toEqual({ passed: true, reason: 'claim renew states "December 31, 2026"' });
  });

  it("ignores the value appearing only in a non-factual sentence", () => {
    const greeting: Draft = { subject: "s", claims: [{ id: "x", sentence: "See you December 31, 2026!", factIds: [], factual: false }] };
    expect(checkExpectation(greeting, e).passed).toBe(false);
  });
});
