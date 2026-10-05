import { TRUST_LEVELS, TRUST_WINDOW } from "@/lib/config";
import { metricById, onlyReal } from "./definitions";
import type { MetricResult, MetricRows } from "./types";

// The trust ladder explains itself: every gate shows what it requires, what the
// data says, and whether it passes. Gates use real data only.

export type Gate = { level: number; label: string; required: string; actual: string; pass: boolean; detail?: string };
export type Trust = {
  level: number; earned: number; name: string; unlocks: string; gates: Gate[];
  drop: { reason: string; workflowId: string } | null; // the event that cost a level
};

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${Math.round(v * 100)}%`);
const metric = (id: string, rows: MetricRows): MetricResult => metricById(id)!.compute(rows);
// The metric's own value is null below its minimum sample, so one approval never reads as "100%".
const shown = (m: MetricResult) => `${m.value === null ? "not enough data" : pct(m.value)} (${m.numerator}/${m.denominator})`;
const atLeast = (m: MetricResult, bar: number) => m.value !== null && m.value >= bar;
const atMost = (m: MetricResult, bar: number) => m.value !== null && m.value <= bar;

function gatesFor(rows: MetricRows): Gate[] {
  const decided = rows.decisions.filter((d) => d.kind !== "ignored").length;
  const clean = metric("clean_approval_rate", rows);
  const facts = metric("fact_correction_rate", rows);
  const stamps = metric("rubber_stamp_rate", rows);
  const completion = metric("completion_rate", rows);
  const fidelity = metric("write_fidelity", rows);
  const gates: Gate[] = [];
  for (const L of TRUST_LEVELS) {
    const g = (label: string, required: string, actual: string, pass: boolean) => gates.push({ level: L.level, label, required, actual, pass });
    if ("minDecisions" in L) g(`Real decisions ≥ ${L.minDecisions}`, `≥ ${L.minDecisions}`, String(decided), decided >= L.minDecisions);
    if ("minCleanApproval" in L) g("Clean approval rate", `≥ ${pct(L.minCleanApproval)}`, shown(clean), atLeast(clean, L.minCleanApproval));
    if ("maxFactCorrection" in L) g("Fact correction rate", `≤ ${pct(L.maxFactCorrection)}`, shown(facts), atMost(facts, L.maxFactCorrection));
    if ("maxRubberStamp" in L) g("Rubber-stamp rate", `≤ ${pct(L.maxRubberStamp)}`, shown(stamps), atMost(stamps, L.maxRubberStamp));
    if ("minCleanApprovalLower" in L) g("Clean approval, lower 95% bound", `≥ ${pct(L.minCleanApprovalLower)}`, pct(clean.ci95?.[0]), (clean.ci95?.[0] ?? 0) >= L.minCleanApprovalLower);
    if ("minCompletion" in L) g("Completion rate", `= ${pct(L.minCompletion)}`, shown(completion), atLeast(completion, L.minCompletion));
    if ("minWriteFidelity" in L) g("Write fidelity", `= ${pct(L.minWriteFidelity)}`, shown(fidelity), atLeast(fidelity, L.minWriteFidelity));
  }
  return gates;
}

// The newest critical event in the window, if any: it costs one level immediately.
function criticalEvent(rows: MetricRows): Trust["drop"] {
  const inWindow = new Set(metric("critical_error_count", rows).rowIds); // decision ids and blocked workflow ids
  const events = [
    ...rows.decisions.filter((d) => d.editSeverities.includes("critical")).map((d) => {
      const cat = d.editCategories[d.editSeverities.indexOf("critical")] ?? "edit";
      return { id: d.id, at: d.decidedAt, reason: `critical edit (${cat.replace(/_/g, " ")})`, workflowId: d.workflowId };
    }),
    ...rows.blocks.map((b) => ({ id: b.id, at: b.at, reason: "shield block", workflowId: b.id })),
  ];
  const newest = events.filter((e) => inWindow.has(e.id)).sort((a, b) => b.at.localeCompare(a.at))[0];
  return newest ? { reason: newest.reason, workflowId: newest.workflowId } : null;
}

export function computeTrustLevel(all: MetricRows): Trust {
  const rows = onlyReal(all);
  const gates = gatesFor(rows);
  let earned = 0;
  for (const L of TRUST_LEVELS.slice(1)) {
    if (gates.filter((g) => g.level === L.level).every((g) => g.pass)) earned = L.level;
    else break;
  }
  const criticals = metric("critical_error_count", rows);
  const drop = criticals.numerator > 0 ? criticalEvent(rows) : null;
  gates.push({
    level: 1, label: `Critical errors in last ${TRUST_WINDOW} = 0`, required: "= 0", actual: String(criticals.numerator), pass: criticals.numerator === 0,
    detail: drop ? `${drop.reason}, ${drop.workflowId}` : undefined,
  });
  const level = drop ? Math.max(0, earned - 1) : earned;
  const info = TRUST_LEVELS[level]!;
  return { level, earned, name: info.name, unlocks: info.unlocks, gates, drop };
}
