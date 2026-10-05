import type { Draft } from "./types";

// Splits a draft into the parts an email shows on separate lines. The content
// hash still covers the joined body, so layout can never change what was approved.
type Line = { sentence: string; factual: boolean };
export type Letter<T extends Line> = { greeting: T[]; body: T[]; signoff: T[] };

export function splitLetter<T extends Line>(claims: T[]): Letter<T> {
  const first = claims[0];
  const last = claims.at(-1);
  const greeting = first && !first.factual && first.sentence.trim().endsWith(",") ? [first] : [];
  const signoff = last && last !== first && !last.factual ? [last] : [];
  return { greeting, body: claims.slice(greeting.length, claims.length - signoff.length), signoff };
}

export function renderLetter(draft: Draft): string {
  const { greeting, body, signoff } = splitLetter(draft.claims);
  const line = (cs: Line[]) => cs.map((c) => c.sentence).join(" ");
  return [line(greeting), line(body), line(signoff)].filter(Boolean).join("\n\n");
}
