import { extractValues, valuesMatch, type Value } from "./tokens";
import type { Draft, EditCategory, Fact, Severity } from "./types";

export type EditSpan = { claimId: string | null; before: string; after: string };
export type ClassifiedEdit = EditSpan & {
  category: EditCategory;
  severity: Severity;
  method: "rule";
  factId: string | null;
  reason: string;
};

// "March 31, 2027" -> "December 31, 2026" shares "31,"; a small gap keeps one edit as one span.
const MERGE_GAP_WORDS = 2;

type Op = { kind: "same" | "del" | "ins"; word: string; beforeIndex: number };

function wordOps(a: string[], b: string[]): Op[] {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: "same", word: a[i]!, beforeIndex: i });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i]![j + 1]! > lcs[i + 1]![j]!)) {
      // Deletions win ties so a replaced word anchors the span to its own claim;
      // a pure insertion belongs to the claim of the word before it.
      ops.push({ kind: "ins", word: b[j]!, beforeIndex: i - 1 });
      j++;
    } else {
      ops.push({ kind: "del", word: a[i]!, beforeIndex: i });
      i++;
    }
  }
  return ops;
}

export function diffBody(draft: Draft, afterBody: string): EditSpan[] {
  const words = draft.claims.flatMap((c) => c.sentence.split(/\s+/).filter(Boolean).map((w) => ({ w, claimId: c.id })));
  const ops = wordOps(words.map((x) => x.w), afterBody.split(/\s+/).filter(Boolean));
  const spans: (EditSpan & { lastOp: number })[] = [];
  ops.forEach((op, k) => {
    if (op.kind === "same") return;
    const claimId = words[Math.max(op.beforeIndex, 0)]?.claimId ?? null;
    const prev = spans.at(-1);
    const gap = prev ? ops.slice(prev.lastOp + 1, k) : [];
    if (prev && prev.claimId === claimId && gap.length <= MERGE_GAP_WORDS) {
      const shared = gap.map((g) => g.word);
      prev.before = [prev.before, ...shared, op.kind === "del" ? op.word : ""].filter(Boolean).join(" ");
      prev.after = [prev.after, ...shared, op.kind === "ins" ? op.word : ""].filter(Boolean).join(" ");
      prev.lastOp = k;
    } else {
      spans.push({ claimId, before: op.kind === "del" ? op.word : "", after: op.kind === "ins" ? op.word : "", lastOp: k });
    }
  });
  return spans.map(({ claimId, before, after }) => ({ claimId, before, after }));
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
const severityOf = (v: Value): Severity => (v.kind === "number" ? "major" : "critical");

function classifySpan(span: EditSpan, cited: Fact[]): ClassifiedEdit | null {
  // Removing text is not a correction: the rep is cutting, not restating a value.
  if (span.after.trim() === "") return null;
  const edit = (severity: Severity, factId: string | null, reason: string): ClassifiedEdit =>
    ({ ...span, category: "fact_correction", severity, method: "rule", factId, reason });
  const before = extractValues(span.before);
  const after = extractValues(span.after);
  const changed = before.filter((b) => !after.some((a) => valuesMatch(a, b)));
  for (const value of changed) {
    const fact = cited.find((f) => extractValues(f.value ?? "").some((fv) => valuesMatch(value, fv)));
    if (fact) return edit(severityOf(value), fact.id, `${value.raw} (from ${fact.id}) changed to "${span.after}"`);
  }
  if (changed.length > 0 && after.length > 0) return edit("major", null, `value changed: ${span.before} → ${span.after} (not from a cited fact)`);
  // Names and other text values: the rep replaced a cited fact's value.
  const named = cited.find((f) => f.value && f.value.length >= 3 && normalize(span.before).includes(normalize(f.value)));
  if (named && span.after) return edit("major", named.id, `"${named.value}" (from ${named.id}) changed to "${span.after}"`);
  return null;
}

export function classifyEdits(spans: EditSpan[], draft: Draft, facts: Fact[]) {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const classified: ClassifiedEdit[] = [];
  const leftover: EditSpan[] = [];
  for (const span of spans) {
    const claim = draft.claims.find((c) => c.id === span.claimId);
    const cited = (claim?.factIds ?? []).map((id) => byId.get(id)).filter((f): f is Fact => f !== undefined);
    const result = classifySpan(span, cited);
    if (result) classified.push(result);
    else leftover.push(span);
  }
  return { classified, leftover };
}
