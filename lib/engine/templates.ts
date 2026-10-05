import type { Claim, Draft, Fact } from "./types";

// Fixture "generation": each sentence is bound to fact keys and filled with
// whichever fact currently wins. Correcting the graph therefore changes the
// next draft for real, with no LLM involved.

export type SentenceTemplate = {
  id: string;
  text: string; // "{fact_key}" placeholders are filled and cited
  factKeys?: string[]; // extra keys the sentence relies on without quoting them
  factual: boolean;
  onlyIfUnknown?: string; // include only while this key's value is unknown
};

export type DraftTemplate = {
  accountId: string;
  recipientContactId: string;
  subject: string;
  sentences: SentenceTemplate[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const PLACEHOLDER = /\{(\w+)\}/g;

export const formatValue = (value: string) =>
  value.replace(ISO_DATE, (_, y: string, m: string, d: string) => `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`);

function renderSentence(t: SentenceTemplate, byKey: Map<string, Fact>): Claim {
  const cited = new Set<string>();
  const sentence = t.text.replace(PLACEHOLDER, (_, key: string) => {
    const fact = byKey.get(key);
    // Rule 5: a missing value is written as "unknown" and left uncited, so verify flags it.
    if (!fact?.value) return "unknown";
    cited.add(fact.id);
    return formatValue(fact.value);
  });
  for (const key of t.factKeys ?? []) {
    const fact = byKey.get(key);
    if (fact) cited.add(fact.id);
  }
  return { id: t.id, sentence, factIds: [...cited], factual: t.factual };
}

export function renderDraft(template: DraftTemplate, current: Fact[]): Draft {
  const byKey = new Map(current.map((f) => [f.key, f]));
  const claims = template.sentences
    .filter((s) => !s.onlyIfUnknown || byKey.get(s.onlyIfUnknown)?.value == null)
    .map((s) => renderSentence(s, byKey));
  return { subject: template.subject, claims };
}
