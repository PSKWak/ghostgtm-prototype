import { verifyDraft } from "@/lib/engine/verify";
import { loadGroundingLabels } from "@/lib/evals/labels";
import { seedStanding, type ExperimentRowInput } from "@/lib/evals/seed-facts";

// The judge is audited: verify.ts labels the 12 hand-labeled drafts and every claim
// records the human label next to the judge's.
export function runGroundingAudit(): ExperimentRowInput[] {
  return loadGroundingLabels().drafts.map((d) => {
    const factual = d.claims.flatMap((c, i) => (c.label === null ? [] : [{ id: `c${i}`, sentence: c.sentence, factIds: c.factIds, factual: true, expected: c.label }]));
    const { verdicts } = verifyDraft({ subject: "", claims: factual }, seedStanding(d.accountId).facts);
    return {
      experiment: "grounding_audit", arm: "verify", caseId: d.id, runIndex: 0, promptVersion: null, isSynthetic: true,
      result: { claims: factual.map((c) => ({ sentence: c.sentence, expected: c.expected, actual: verdicts.find((v) => v.claimId === c.id)?.label ?? "missing", reason: verdicts.find((v) => v.claimId === c.id)?.reason ?? "" })) },
    };
  });
}
