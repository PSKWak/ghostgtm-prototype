import type { ClassifiedEdit } from "./diff";
import { rankFacts, type Standing } from "./standing";
import { extractValues, isRealDate } from "./tokens";
import { fail, ok, type Fact, type Result } from "./types";

// A rep's fact edit becomes a proposed graph correction. It only takes effect
// once a named human confirms it (rule 7). When the new value can't be read
// cleanly, the rep is told why instead of Ghost storing a guess.

export type FactProposal = { factKey: string; currentFactId: string; proposedValue: string; claimId: string | null };
export type Unresolved = { claimId: string | null; factKey: string; reason: string };

const pad = (n: number) => String(n).padStart(2, "0");
const label = (key: string) => key.replace(/_/g, " ");
const NAME = /^[A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+)+$/u;
const MAX_EXTRA_WORDS = 2; // a short replacement is a value; a longer one is a rewritten sentence

// Full names in the replacement that weren't in the original ("Petra Novak").
function newNames(before: string, after: string): string[] {
  const runs: string[][] = [[]];
  for (const raw of after.split(/\s+/)) {
    const word = raw.replace(/[.,;:!?]+$/, "");
    const capital = /^[A-Z][\p{L}'-]*$/u.test(word) && word !== "I" && !word.startsWith("I'");
    if (capital) runs.at(-1)!.push(word);
    if (!capital || word !== raw) runs.push([]);
  }
  return runs.filter((r) => r.length >= 2).map((r) => r.join(" ")).filter((n) => !before.includes(n));
}

function readValue(fact: Fact, after: string): { value: string } | { reason: string } {
  const what = label(fact.key);
  const [old] = extractValues(fact.value ?? "");
  if (old) {
    const next = readNewValue(old.kind, after, what);
    // "Security review call, week of 2026-10-12" keeps its words; only the value moves.
    return "value" in next ? { value: (fact.value ?? "").replace(old.raw, next.value) } : next;
  }
  if (fact.value && NAME.test(fact.value)) {
    const names = newNames(fact.value, after);
    return names.length === 1 ? { value: names[0]! } : { reason: `couldn't tell the new ${what} from your edit; write the full name` };
  }
  const text = after.trim().replace(/[.,;:!?]+$/, "");
  const limit = (fact.value ?? "").split(/\s+/).length + MAX_EXTRA_WORDS;
  return text && text.split(/\s+/).length <= limit ? { value: text } : { reason: `couldn't tell the new ${what} from your edit` };
}

function readNewValue(kind: string, after: string, what: string): { value: string } | { reason: string } {
  const next = extractValues(after).find((v) => v.kind === kind);
  if (!next) return { reason: `couldn't find a new ${what} in your edit` };
  if (next.kind !== "date") return { value: next.kind === "money" ? `$${next.n.toLocaleString("en-US")}` : String(next.n) };
  if (next.ambiguous) return { reason: `"${next.raw}" could mean two different dates; write the month as a word` };
  if (next.y === undefined || next.d === undefined) return { reason: `write the full ${what}, including day and year` };
  if (!isRealDate(next)) return { reason: `"${next.raw}" isn't a real date` };
  return { value: `${next.y}-${pad(next.m)}-${pad(next.d)}` };
}

export function proposeCorrections(edits: ClassifiedEdit[], facts: Fact[]): { proposals: FactProposal[]; unresolved: Unresolved[] } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const proposals = new Map<string, FactProposal>();
  const unresolved: Unresolved[] = [];
  for (const e of edits) {
    const fact = e.factId ? byId.get(e.factId) : undefined;
    if (!fact || e.category !== "fact_correction") continue;
    const read = readValue(fact, e.after);
    if ("reason" in read) unresolved.push({ claimId: e.claimId, factKey: fact.key, reason: read.reason });
    else if (read.value !== fact.value) proposals.set(fact.key, { factKey: fact.key, currentFactId: fact.id, proposedValue: read.value, claimId: e.claimId });
  }
  return { proposals: [...proposals.values()], unresolved };
}

export type Confirmation = { userId: string; decisionId: string; now: string };

export function applyCorrection(facts: Fact[], p: FactProposal, c: Confirmation): Result<{ newFact: Fact; standing: Standing }> {
  if (!c.userId) return fail("a human must confirm a correction");
  const current = facts.find((f) => f.id === p.currentFactId);
  if (!current) return fail(`fact ${p.currentFactId} not found`);
  const newFact: Fact = {
    id: `f_h_${c.decisionId}_${p.factKey}`, accountId: current.accountId, key: p.factKey, value: p.proposedValue,
    source: "human_approved", sourceRef: `decision:${c.decisionId}`, observedAt: c.now, supersededBy: null, supersededReason: null,
  };
  return ok({ newFact, standing: rankFacts([...facts, newFact]) });
}
