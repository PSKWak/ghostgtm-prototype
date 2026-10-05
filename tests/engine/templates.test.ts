import { describe, expect, it } from "vitest";
import { formatValue, renderDraft, type DraftTemplate } from "@/lib/engine/templates";
import { verifyDraft } from "@/lib/engine/verify";
import type { Fact } from "@/lib/engine/types";

const fact = (id: string, key: string, value: string | null): Fact => ({
  id, accountId: "a", key, value, source: "crm_explicit", sourceRef: "x",
  observedAt: "2026-01-01T00:00:00Z", supersededBy: null, supersededReason: null,
});

const template: DraftTemplate = {
  accountId: "a",
  recipientContactId: "ct",
  subject: "Following up",
  insight: "test",
  sentences: [
    { id: "hi", text: "Hi Dana,", factual: false },
    { id: "renew", text: "I have your renewal down for {renewal_date}.", factual: true },
    { id: "budget", text: "I understand the budget owner is not decided yet.", factKeys: ["budget_owner"], factual: true, onlyIfUnknown: "budget_owner" },
  ],
};

describe("formatValue", () => {
  it("writes ISO dates out in words so they read naturally", () => {
    expect(formatValue("2027-03-31")).toBe("March 31, 2027");
    expect(formatValue("Security review call, week of 2026-10-12")).toBe("Security review call, week of October 12, 2026");
  });
});

describe("renderDraft", () => {
  it("fills placeholders from the current facts and cites them", () => {
    const draft = renderDraft(template, [fact("f1", "renewal_date", "2027-03-31"), fact("f2", "budget_owner", null)]);
    expect(draft.claims.map((c) => c.sentence)).toEqual([
      "Hi Dana,", "I have your renewal down for March 31, 2027.", "I understand the budget owner is not decided yet.",
    ]);
    expect(draft.claims.map((c) => c.factIds)).toEqual([[], ["f1"], ["f2"]]);
  });

  it("produces a different draft when the winning fact changes (the learning loop)", () => {
    const draft = renderDraft(template, [fact("f9", "renewal_date", "2026-12-31"), fact("f2", "budget_owner", null)]);
    expect(draft.claims[1]).toMatchObject({ sentence: "I have your renewal down for December 31, 2026.", factIds: ["f9"] });
  });

  it("drops an 'unknown' sentence once the value is known", () => {
    const draft = renderDraft(template, [fact("f1", "renewal_date", "2027-03-31"), fact("f2", "budget_owner", "Dana Okafor")]);
    expect(draft.claims.map((c) => c.id)).toEqual(["hi", "renew"]);
  });

  it("writes 'unknown' with no citation for a missing fact, which verify then flags (rule 5)", () => {
    const draft = renderDraft(template, []);
    expect(draft.claims[1]).toMatchObject({ sentence: "I have your renewal down for unknown.", factIds: [] });
    expect(verifyDraft(draft, []).passed).toBe(false);
  });

  it("renders drafts that pass verification when facts exist", () => {
    const facts = [fact("f1", "renewal_date", "2027-03-31"), fact("f2", "budget_owner", null)];
    expect(verifyDraft(renderDraft(template, facts), facts).passed).toBe(true);
  });
});
