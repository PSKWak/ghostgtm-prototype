import { describe, expect, it } from "vitest";
import { assessRisk, type RiskInput } from "@/lib/engine/risk";

const base: RiskInput = {
  action: "send_email",
  draftText: "Hi Dana, thanks for the call. I'll send the SOC 2 report today.",
  accountDomain: "brightlinefreight.com",
  recipient: { email: "dana.okafor@brightlinefreight.com", isExecutive: false },
  verdicts: [{ claimId: "c1", label: "supported", reason: "" }],
  citedFactIds: ["f1"],
  contestedFactIds: [],
  challengedFactIds: [],
  openEscalation: false,
  approval: "none",
  trustLevel: 0,
};

const at = (over: Partial<RiskInput>) => assessRisk({ ...base, ...over });

describe("assessRisk", () => {
  it("always returns a reason and a rule name", () => {
    const r = at({});
    expect(r.reason.length).toBeGreaterThan(0);
    expect(r.rule.length).toBeGreaterThan(0);
  });

  it("requires approval for an unapproved external email at low trust", () => {
    expect(at({})).toMatchObject({ verdict: "require_approval", rule: "trust_below_email_autorun" });
  });

  it("allows once a human approved and no block rule fires", () => {
    expect(at({ approval: "approved" })).toMatchObject({ verdict: "allow", rule: "human_approved" });
  });

  it("blocks a recipient outside the account domain, even when approved", () => {
    expect(at({ approval: "approved", recipient: { email: "dana@gmail.com", isExecutive: false } }))
      .toMatchObject({ verdict: "block", rule: "wrong_recipient" });
    expect(at({ recipient: null })).toMatchObject({ verdict: "block", rule: "wrong_recipient" });
  });

  it("blocks unsupported or stale claims, even when approved", () => {
    expect(at({ approval: "approved", verdicts: [{ claimId: "c1", label: "none", reason: "no citation" }] }))
      .toMatchObject({ verdict: "block", rule: "unsupported_claim" });
    expect(at({ approval: "approved", verdicts: [{ claimId: "c1", label: "stale", reason: "x" }] }))
      .toMatchObject({ verdict: "block", rule: "stale_fact" });
  });

  it("blocks commercial asks during an open escalation", () => {
    expect(at({ approval: "approved", openEscalation: true, draftText: "Happy to share pricing for the 3 new sites." }))
      .toMatchObject({ verdict: "block", rule: "commercial_during_escalation" });
    expect(at({ approval: "approved", openEscalation: true, draftText: "Let's talk about the 3 additional clinic sites." }).rule)
      .toBe("commercial_during_escalation");
    expect(at({ approval: "approved", openEscalation: true, draftText: "The root-cause analysis will arrive Friday." }).verdict)
      .toBe("allow");
  });

  it("requires approval for contested facts until a human approves", () => {
    expect(at({ trustLevel: 5, citedFactIds: ["f1"], contestedFactIds: ["f1"] }))
      .toMatchObject({ verdict: "require_approval", rule: "contested_fact" });
    expect(at({ approval: "approved", contestedFactIds: ["f1"] }).verdict).toBe("allow");
  });

  it("requires approval for a fact that newer evidence contradicts, even at high trust", () => {
    expect(at({ trustLevel: 5, challengedFactIds: ["f1"] }))
      .toMatchObject({ verdict: "require_approval", rule: "challenged_fact" });
  });

  it("requires approval for executive recipients and partial support regardless of trust", () => {
    expect(at({ trustLevel: 5, recipient: { email: "dana.okafor@brightlinefreight.com", isExecutive: true } }).rule)
      .toBe("executive_recipient");
    expect(at({ trustLevel: 5, verdicts: [{ claimId: "c1", label: "partial", reason: "" }] }).rule).toBe("partial_support");
  });

  it("lets trust auto-allow only reversible or well-grounded actions (autonomy simulation)", () => {
    expect(at({ action: "log_crm_activity", recipient: null, trustLevel: 2 })).toMatchObject({ verdict: "allow", rule: "internal_reversible" });
    expect(at({ action: "log_crm_activity", recipient: null, trustLevel: 1 }).verdict).toBe("require_approval");
    expect(at({ action: "create_crm_task", recipient: null, trustLevel: 2 }).rule).toBe("internal_reversible");
    expect(at({ trustLevel: 3 })).toMatchObject({ verdict: "allow", rule: "trusted_grounded_email" });
  });
});
