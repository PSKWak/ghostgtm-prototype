import { AUTO_RUN_EMAIL_MIN_TRUST, AUTO_RUN_MIN_TRUST } from "@/lib/config";
import { findCommercialSentences } from "./commercial";
import { INTERNAL_ACTIONS, type ActionKind, type ClaimVerdict, type RiskResult } from "./types";

export type RiskInput = {
  action: ActionKind;
  draftText: string;
  accountDomain: string;
  recipient: { email: string; isExecutive: boolean } | null;
  verdicts: ClaimVerdict[];
  citedFactIds: string[];
  contestedFactIds: string[];
  challengedFactIds: string[]; // current facts that newer, lower-tier evidence disagrees with
  openEscalation: boolean;
  approval: "approved" | "none";
  trustLevel: number;
};


const r = (verdict: RiskResult["verdict"], rule: string, reason: string): RiskResult => ({ verdict, rule, reason });

// Block rules hold even after a human approves: approval cannot make these safe.
function checkShield(input: RiskInput): RiskResult | null {
  const domain = input.recipient?.email.split("@")[1]?.toLowerCase();
  // Prevents: sending customer context to someone outside the account.
  if (input.action === "send_email" && domain !== input.accountDomain.toLowerCase()) {
    return r("block", "wrong_recipient", `recipient ${input.recipient?.email ?? "(none)"} is not @${input.accountDomain}`);
  }
  // Prevents: sending a claim the evidence does not back (hallucination).
  const unsupported = input.verdicts.find((v) => v.label === "none");
  if (unsupported) return r("block", "unsupported_claim", `claim ${unsupported.claimId} unsupported: ${unsupported.reason}`);
  // Prevents: repeating a value that has been superseded by better information.
  const stale = input.verdicts.find((v) => v.label === "stale");
  if (stale) return r("block", "stale_fact", `claim ${stale.claimId} cites a superseded fact`);
  // Prevents: a sales push while the customer is waiting on a fix.
  const pitch = input.openEscalation ? findCommercialSentences(input.draftText)[0] : undefined;
  if (pitch) return r("block", "commercial_during_escalation", `open support escalation: commercial asks are paused ("${pitch}")`);
  return null;
}

// Without approval: decides whether the action could run on trust alone.
// The product never acts on this (rule 1); the autonomy simulation measures it.
function checkAutonomy(input: RiskInput): RiskResult {
  // Prevents: an agent guessing between two plausible versions of the truth.
  const contested = input.citedFactIds.find((id) => input.contestedFactIds.includes(id));
  if (contested) return r("require_approval", "contested_fact", `cites contested fact ${contested}`);
  // Prevents: repeating a stale system-of-record value that newer evidence contradicts (Brightline's renewal date).
  const challenged = input.citedFactIds.find((id) => input.challengedFactIds.includes(id));
  if (challenged) return r("require_approval", "challenged_fact", `cites ${challenged}, which newer evidence contradicts`);
  if (INTERNAL_ACTIONS.includes(input.action)) {
    // Prevents: unreviewed CRM writes before the agent has a track record. CRM notes are internal and reversible.
    return input.trustLevel >= AUTO_RUN_MIN_TRUST
      ? r("allow", "internal_reversible", `internal note at trust ${input.trustLevel}`)
      : r("require_approval", "trust_below_autorun", `trust ${input.trustLevel} < ${AUTO_RUN_MIN_TRUST}`);
  }
  // Prevents: unreviewed messages to executives, where a mistake costs the relationship.
  if (input.recipient?.isExecutive) return r("require_approval", "executive_recipient", "recipient is an executive");
  // Prevents: sending claims that are only partly grounded.
  if (input.verdicts.some((v) => v.label === "partial")) return r("require_approval", "partial_support", "a claim is only partially supported");
  // Prevents: external email at trust levels that have not earned it.
  return input.trustLevel >= AUTO_RUN_EMAIL_MIN_TRUST
    ? r("allow", "trusted_grounded_email", `all claims supported at trust ${input.trustLevel}`)
    : r("require_approval", "trust_below_email_autorun", `trust ${input.trustLevel} < ${AUTO_RUN_EMAIL_MIN_TRUST}`);
}

export function assessRisk(input: RiskInput): RiskResult {
  const blocked = checkShield(input);
  if (blocked) return blocked;
  if (input.approval === "approved") return r("allow", "human_approved", "approved by a rep; no block rule fired");
  return checkAutonomy(input);
}
