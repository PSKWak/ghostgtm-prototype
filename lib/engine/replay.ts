import { renderBody } from "./hash";
import { formatValue } from "./templates";
import type { Draft } from "./types";

// A confirmed correction becomes a regression test: every later draft for the
// account must state the corrected value.

export type TestExpectation = { factKey: string; mustContain: string };

export const expectationFor = (factKey: string, value: string): TestExpectation =>
  ({ factKey, mustContain: formatValue(value) });

export function checkExpectation(draft: Draft, e: TestExpectation): { passed: boolean; reason: string } {
  const hit = draft.claims.find((c) => c.factual && c.sentence.includes(e.mustContain));
  if (hit) return { passed: true, reason: `claim ${hit.id} states "${e.mustContain}"` };
  const body = renderBody(draft);
  return { passed: false, reason: `no factual sentence states "${e.mustContain}" (draft: ${body.slice(0, 120)}…)` };
}
