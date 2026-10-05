import { describe, expect, it } from "vitest";
import { explainRisk } from "@/lib/flow/explain";
import type { Fact } from "@/lib/engine/types";

const crm: Fact = { id: "f_bf_renewal_crm", accountId: "a", key: "renewal_date", value: "2027-03-31", source: "crm_explicit", sourceRef: "crm", observedAt: "2025-03-14T00:00:00Z", supersededBy: null, supersededReason: null };
const call: Fact = { ...crm, id: "f_bf_renewal_call", value: "2026-12-31", source: "ai_inferred", observedAt: "2026-10-01T15:14:05Z", supersededBy: "f_bf_renewal_crm" };

describe("explainRisk", () => {
  it("names both values and their sources for a challenged fact", () => {
    const e = explainRisk({ verdict: "require_approval", rule: "challenged_fact", reason: "cites f_bf_renewal_crm, which newer evidence contradicts" }, [crm, call]);
    expect(e).toEqual({
      tone: "review", headline: "Needs your OK",
      detail: "The renewal date on file is March 31, 2027 (from the CRM, 2025-03-14), but a call on 2026-10-01 said December 31, 2026. Check it before this goes out.",
    });
  });

  it("names both sides of a contested fact", () => {
    const a: Fact = { ...crm, id: "f_or_approver_2", key: "final_approver", value: "Tomas Hruby", source: "ai_inferred", supersededBy: null };
    const b: Fact = { ...a, id: "f_or_approver_1", value: "Petra Novak", supersededBy: "f_or_approver_2" };
    expect(explainRisk({ verdict: "require_approval", rule: "contested_fact", reason: "cites contested fact f_or_approver_2" }, [a, b]).detail)
      .toBe("Two calls disagree on the final approver: Tomas Hruby vs Petra Novak. Ghost used the newer one; confirm it's right.");
  });

  it("explains a shield block without rule ids", () => {
    const e = explainRisk({ verdict: "block", rule: "commercial_during_escalation", reason: "x" }, []);
    expect(e.tone).toBe("held");
    expect(e.detail).not.toMatch(/_/);
  });
});
