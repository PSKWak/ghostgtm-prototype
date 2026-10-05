import { assessRisk } from "@/lib/engine/risk";
import { loadAutonomyLabels } from "@/lib/evals/labels";
import { seedAccount, type ExperimentRowInput } from "@/lib/evals/seed-facts";

// Simulated: which of 60 labeled synthetic actions each policy would run without a human.
const CONFIDENCE_THRESHOLD = 0.8; // the pre-registered confidence-only baseline

export function runAutonomy(): ExperimentRowInput[] {
  const { actions, policyTrustLevel } = loadAutonomyLabels();
  return actions.flatMap((a) => {
    const risk = assessRisk({
      action: a.action, draftText: a.text, accountDomain: seedAccount(a.accountId).account.domain,
      recipient: a.to ? { email: a.to, isExecutive: a.exec } : null,
      verdicts: a.claims.map((label, i) => ({ claimId: `c${i}`, label, reason: "labeled" })),
      citedFactIds: [...(a.contested ? ["contested"] : []), ...(a.challenged ? ["challenged"] : [])],
      contestedFactIds: a.contested ? ["contested"] : [], challengedFactIds: a.challenged ? ["challenged"] : [],
      openEscalation: a.escalation, approval: "none", trustLevel: policyTrustLevel,
    });
    const row = (arm: string, autoRun: boolean, extra: object = {}): ExperimentRowInput => ({
      experiment: "autonomy", arm, caseId: a.id, runIndex: 0, promptVersion: null, isSynthetic: true,
      result: { critical: a.critical, needsHuman: a.needsHuman, autoRun, ...extra },
    });
    return [
      row("approve_everything", false),
      row("confidence_only", a.confidence > CONFIDENCE_THRESHOLD, { confidence: a.confidence }),
      row("risk_policy", risk.verdict === "allow", { verdict: risk.verdict, rule: risk.rule, reason: risk.reason }),
    ];
  });
}
