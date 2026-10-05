import { wilson } from "./stats";
import type { Breakdown, MetricResult } from "./types";

type Row = { id: string; isSynthetic: boolean };

// Builds a rate result from the denominator rows and the subset that counts. Every
// number it returns can be traced back to the ids in rowIds.
export function rateResult<T extends Row>(denominatorRows: T[], counts: (row: T) => boolean, minSample: number): MetricResult {
  const hits = denominatorRows.filter(counts);
  const n = denominatorRows.length;
  return {
    value: n >= minSample && n > 0 ? hits.length / n : null,
    numerator: hits.length,
    denominator: n,
    ci95: wilson(hits.length, n),
    rowIds: denominatorRows.map((r) => r.id),
    realCount: denominatorRows.filter((r) => !r.isSynthetic).length,
    syntheticCount: denominatorRows.filter((r) => r.isSynthetic).length,
  };
}

export function breakdownOf<T>(groups: Map<string, T[]>, counts: (row: T) => boolean, minSample: number, label = (k: string) => k): Breakdown[] {
  return [...groups.entries()].map(([key, rows]) => {
    const k = rows.filter(counts).length;
    return { key, label: label(key), numerator: k, denominator: rows.length, value: rows.length >= minSample ? k / rows.length : null, ci95: wilson(k, rows.length) };
  });
}

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return groups;
}
