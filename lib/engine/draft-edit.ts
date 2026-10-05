import { extractValues } from "./tokens";
import { fail, ok, type Claim, type Draft, type Result } from "./types";

// The rep edits sentence by sentence, so citations survive the edit.

export type ClaimEdit = { id: string; sentence: string };

function editClaim(claim: Claim, text: string): Claim | null {
  const sentence = text.trim();
  // Clearing a sentence removes it; a blank line is never sent.
  if (sentence === "") return null;
  // Rule 5: a greeting or sign-off that now states a figure or date is a factual
  // claim with no citation, so verify flags it instead of skipping it.
  const factual = claim.factual || extractValues(sentence).length > 0;
  return { ...claim, sentence, factual };
}

export function applyClaimEdits(draft: Draft, edits: ClaimEdit[]): Result<Draft> {
  const unknown = edits.filter((e) => !draft.claims.some((c) => c.id === e.id)).map((e) => e.id);
  if (unknown.length > 0) return fail(`unknown sentence id(s): ${unknown.join(", ")}`);
  const byId = new Map(edits.map((e) => [e.id, e.sentence]));
  const claims = draft.claims.flatMap((c) => {
    const text = byId.get(c.id);
    if (text === undefined || text.trim() === c.sentence) return [c];
    const edited = editClaim(c, text);
    return edited ? [edited] : [];
  });
  if (!claims.some((c) => c.factual)) return fail("the draft has no factual sentences left to send");
  return ok({ ...draft, claims });
}

// After a confirmed correction, edited claims cite the new human_approved fact.
export function reciteClaims(draft: Draft, replacements: Map<string, string>): Draft {
  return {
    ...draft,
    claims: draft.claims.map((c) => ({ ...c, factIds: c.factIds.map((id) => replacements.get(id) ?? id) })),
  };
}
