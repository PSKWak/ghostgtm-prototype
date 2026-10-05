import { renderBody } from "@/lib/engine/hash";
import { assessRisk } from "@/lib/engine/risk";
import { ACTIONS, type ActionKind, type ClaimVerdict, type Draft, type RiskResult } from "@/lib/engine/types";
import { hasOpenEscalation, type AccountContext } from "./context";

// Product trust is 0 until Phase 6 computes the ladder, so nothing auto-runs.
const PRODUCT_TRUST_LEVEL = 0;

export function assessAllActions(
  ctx: AccountContext, draft: Draft, verdicts: ClaimVerdict[], recipientContactId: string | null, approval: "approved" | "none",
): { action: ActionKind; risk: RiskResult }[] {
  const recipient = ctx.contacts.find((c) => c.id === recipientContactId);
  return ACTIONS.map((action) => ({
    action,
    risk: assessRisk({
      action,
      draftText: `${draft.subject} ${renderBody(draft)}`,
      accountDomain: ctx.account.domain,
      recipient: action === "send_email" && recipient ? { email: recipient.email, isExecutive: recipient.isExecutive } : null,
      verdicts,
      citedFactIds: draft.claims.flatMap((c) => c.factIds),
      contestedFactIds: ctx.standing.contested.flatMap((c) => c.factIds),
      challengedFactIds: ctx.standing.challenged.map((c) => c.factId),
      openEscalation: hasOpenEscalation(ctx.standing),
      approval,
      trustLevel: PRODUCT_TRUST_LEVEL,
    }),
  }));
}

// The strictest verdict across actions decides the workflow: one block stops everything.
export function strictest(results: { risk: RiskResult }[]): RiskResult {
  const order = ["block", "require_approval", "allow"] as const;
  const sorted = [...results].sort((a, b) => order.indexOf(a.risk.verdict) - order.indexOf(b.risk.verdict));
  const first = sorted[0];
  if (!first) throw new Error("assessAllActions returned no actions");
  return first.risk;
}
