// Checkable values inside text: the parts of a claim a rule can verify without an LLM.

export type Value =
  // ambiguous: a numeric date like 03/04/2026 that could be March 4 or April 3.
  | { kind: "date"; y?: number; m: number; d?: number; raw: string; ambiguous?: true }
  | { kind: "money"; n: number; raw: string }
  | { kind: "number"; n: number; raw: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Capitalized month names only, so "may" the verb is not read as a month.
const WRITTEN_DATE =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?\b/g;
// "31 December 2026": day first, as most of the world writes it.
const DAY_FIRST_DATE =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+(\d{4})\b/g;
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const ISO_DATE = /\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/g;
const MONEY = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?\b/g;
const NUMBER = /\b\d[\d,]*(?:\.\d+)?%?/g;

const toNumber = (s: string) => Number(s.replace(/[,%]/g, ""));
const optional = (s: string | undefined) => (s ? Number(s) : undefined);

type Found = { index: number; value: Value };

function scan(text: string, re: RegExp, read: (m: RegExpExecArray) => Value): Found[] {
  return [...text.matchAll(re)].map((m) => ({ index: m.index, value: read(m as RegExpExecArray) }));
}

// Blank out matched spans so later passes do not re-read their digits.
const mask = (text: string, found: Found[]) =>
  found.reduce((t, f) => t.slice(0, f.index) + " ".repeat(f.value.raw.length) + t.slice(f.index + f.value.raw.length), text);

const withoutUndefined = (v: Value): Value =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as Value;

const monthOf = (name: string | undefined) => MONTHS.indexOf((name ?? "").slice(0, 3)) + 1;

// 12/31/2026 and 31/12/2026 are unambiguous; 03/04/2026 is not, and is never guessed.
function readNumericDate(m: RegExpExecArray): Value {
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a > 12 && b <= 12) return { kind: "date", y, m: b, d: a, raw: m[0] };
  if ((b > 12 && a <= 12) || a === b) return { kind: "date", y, m: a, d: b, raw: m[0] };
  return { kind: "date", y, m: a, d: b, raw: m[0], ambiguous: true };
}

export function extractValues(text: string): Value[] {
  const iso = scan(text, ISO_DATE, (m) => ({ kind: "date", y: Number(m[1]), m: Number(m[2]), d: optional(m[3]), raw: m[0] }));
  let rest = mask(text, iso);
  const numeric = scan(rest, NUMERIC_DATE, readNumericDate);
  rest = mask(rest, numeric);
  const dayFirst = scan(rest, DAY_FIRST_DATE, (m) => ({ kind: "date", y: Number(m[3]), m: monthOf(m[2]), d: Number(m[1]), raw: m[0] }));
  rest = mask(rest, dayFirst);
  const written = scan(rest, WRITTEN_DATE, (m) => ({
    kind: "date", y: optional(m[3]), m: monthOf(m[1]), d: optional(m[2]), raw: m[0],
  }));
  rest = mask(rest, written);
  const money = scan(rest, MONEY, (m) => {
    const scale = { k: 1e3, m: 1e6 }[(m[2] ?? "").toLowerCase()] ?? 1;
    return { kind: "money", n: toNumber(m[1] ?? "0") * scale, raw: m[0] };
  });
  rest = mask(rest, money);
  const numbers = scan(rest, NUMBER, (m) => ({ kind: "number", n: toNumber(m[0]), raw: m[0] }));
  return [...iso, ...numeric, ...dayFirst, ...written, ...money, ...numbers]
    .sort((a, b) => a.index - b.index)
    .map((f) => withoutUndefined(f.value));
}

// Two values agree when every part both of them state is equal.
export function valuesMatch(a: Value, b: Value): boolean {
  if (a.kind === "date" && b.kind === "date") {
    if (a.ambiguous || b.ambiguous) return false;
    const same = (x?: number, y?: number) => x === undefined || y === undefined || x === y;
    return a.m === b.m && same(a.y, b.y) && same(a.d, b.d);
  }
  if (a.kind === "date" || b.kind === "date") return false;
  return a.kind === b.kind && a.n === b.n;
}

// A full date that exists on the calendar (rejects February 30 and ambiguous numeric dates).
export function isRealDate(v: Value): boolean {
  if (v.kind !== "date" || v.ambiguous || v.y === undefined || v.d === undefined) return false;
  const d = new Date(Date.UTC(v.y, v.m - 1, v.d));
  return d.getUTCFullYear() === v.y && d.getUTCMonth() === v.m - 1 && d.getUTCDate() === v.d;
}
