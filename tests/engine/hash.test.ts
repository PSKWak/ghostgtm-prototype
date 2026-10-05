import { describe, expect, it } from "vitest";
import { hashDraft } from "@/lib/engine/hash";
import type { Draft } from "@/lib/engine/types";

const draft = (body: string[], subject = "Follow-up"): Draft => ({
  subject,
  claims: body.map((sentence, i) => ({ id: `c${i}`, sentence, factIds: [], factual: false })),
});

describe("hashDraft", () => {
  it("ignores whitespace and claim splitting", () => {
    expect(hashDraft(draft(["Hi Dana,  thanks."]))).toBe(hashDraft(draft(["Hi Dana,", "thanks."])));
  });
  it("changes when a word or the subject changes", () => {
    const base = hashDraft(draft(["Renewal is March 2027."]));
    expect(hashDraft(draft(["Renewal is December 2026."]))).not.toBe(base);
    expect(hashDraft(draft(["Renewal is March 2027."], "Re: renewal"))).not.toBe(base);
  });
});
