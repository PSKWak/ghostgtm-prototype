import { describe, expect, it } from "vitest";
import { loadAutonomyLabels, loadFeedbackLabels, loadGroundingLabels } from "@/lib/evals/labels";
import { SEED_ACCOUNTS } from "@/lib/db/seed";

// Shape checks only: these tests never run an arm, so they cannot leak results into the labels.
const seedFactIds = new Set(SEED_ACCOUNTS.flatMap((a) => a.facts.map((f) => f.id)));
const accountIds = SEED_ACCOUNTS.map((a) => a.account.id);

describe("pre-registered labels", () => {
  it("grounding: 12 drafts, 4 per account, citing only seed facts", () => {
    const { drafts } = loadGroundingLabels();
    expect(drafts).toHaveLength(12);
    for (const id of accountIds) expect(drafts.filter((d) => d.accountId === id)).toHaveLength(4);
    for (const f of drafts.flatMap((d) => d.claims.flatMap((c) => c.factIds))) expect(seedFactIds).toContain(f);
  });

  it("feedback: 17 cases citing only seed facts", () => {
    const { cases } = loadFeedbackLabels();
    expect(cases).toHaveLength(17);
    for (const c of cases) if (c.kind === "edit") for (const f of c.claimFactIds) expect(seedFactIds).toContain(f);
  });

  it("autonomy: 60 unique synthetic actions; every critical action also needs a human", () => {
    const { actions } = loadAutonomyLabels();
    expect(new Set(actions.map((a) => a.id)).size).toBe(60);
    for (const a of actions) {
      expect(accountIds).toContain(a.accountId);
      if (a.critical) expect(a.needsHuman, a.id).toBe(true);
      expect(a.action === "send_email" ? a.to !== null : a.to === null, a.id).toBe(true);
    }
  });
});
