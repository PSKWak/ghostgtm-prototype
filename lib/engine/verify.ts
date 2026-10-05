import { extractValues, valuesMatch } from "./tokens";
import type { Claim, ClaimVerdict, Draft, Fact } from "./types";

// Deterministic grounding check. It verifies citations and checkable values
// (dates, money, numbers); semantic support beyond that is left to the LLM judge.

const PERSON = /^[A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+)+$/u;
const SAYS_UNKNOWN = /\b(unknown|not (yet )?(confirmed|known|sure|decided)|to be confirmed|tbd)\b/i;

export type Verification = { passed: boolean; verdicts: ClaimVerdict[] };

function verifyClaim(claim: Claim, byId: Map<string, Fact>): ClaimVerdict {
  const v = (label: ClaimVerdict["label"], reason: string): ClaimVerdict => ({ claimId: claim.id, label, reason });
  if (claim.factIds.length === 0) return v("none", "no citation");

  const missing = claim.factIds.filter((id) => !byId.has(id));
  if (missing.length > 0) return v("none", `cites fact not in input: ${missing.join(", ")}`);

  const cited = claim.factIds.map((id) => byId.get(id)).filter((f): f is Fact => f !== undefined);
  const stale = cited.find((f) => f.supersededBy !== null);
  if (stale) return v("stale", `cites superseded fact ${stale.id} (${stale.supersededReason ?? "superseded"})`);

  const unknown = cited.find((f) => f.value === null);
  if (unknown && !SAYS_UNKNOWN.test(claim.sentence)) return v("none", `asserts a value for unknown fact ${unknown.id}`);

  // Names can't be value-matched, so a cited person must at least be named.
  const unnamed = cited.find((f) => f.value && PERSON.test(f.value) && !claim.sentence.includes(f.value));
  if (unnamed) return v("partial", `doesn't name ${unnamed.value} (from ${unnamed.id})`);

  const claimed = extractValues(claim.sentence);
  if (claimed.length === 0) return v("supported", "citation valid; no checkable values");

  const backing = cited.flatMap((f) => extractValues(f.value ?? ""));
  const unmatched = claimed.filter((c) => !backing.some((b) => valuesMatch(c, b)));
  if (unmatched.length === 0) return v("supported", "all values match cited facts");
  if (unmatched.length === claimed.length) return v("none", `no value matches cited facts: ${unmatched.map((u) => u.raw).join(", ")}`);
  return v("partial", `unmatched: ${unmatched.map((u) => u.raw).join(", ")}`);
}

export function verifyDraft(draft: Draft, inputFacts: Fact[]): Verification {
  const byId = new Map(inputFacts.map((f) => [f.id, f]));
  const verdicts = draft.claims.filter((c) => c.factual).map((c) => verifyClaim(c, byId));
  return { passed: verdicts.every((v) => v.label === "supported"), verdicts };
}
