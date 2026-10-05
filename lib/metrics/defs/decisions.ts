import { DEFAULT_MIN_SAMPLE, RUBBER_STAMP_MS, TRUST_WINDOW } from "@/lib/config";
import { breakdownOf, groupBy, rateResult } from "../result";
import { wilson } from "../stats";
import type { DecisionRow, MetricDef, MetricRows } from "../types";

const decided = (r: MetricRows) => r.decisions.filter((d) => d.kind !== "ignored");
const approved = (r: MetricRows) => r.decisions.filter((d) => d.kind === "approved_clean" || d.kind === "approved_edited");
const read = (d: DecisionRow) => d.reviewMs >= RUBBER_STAMP_MS;

export const decisionMetrics: MetricDef[] = [
  {
    id: "clean_approval_rate", label: "Clean approval rate", kind: "rate", source: "decisions", minSample: DEFAULT_MIN_SAMPLE,
    question: "How often do reps approve without editing, while actually reading?",
    numerator: `approved_clean decisions reviewed for at least ${RUBBER_STAMP_MS / 1000}s (not rubber stamps)`,
    denominator: "all decided workflows (approved + rejected), excluding ignored",
    compute: (r) => rateResult(decided(r), (d) => d.kind === "approved_clean" && read(d), DEFAULT_MIN_SAMPLE),
  },
  {
    id: "fact_correction_rate", label: "Fact correction rate", kind: "rate", source: "decisions", minSample: DEFAULT_MIN_SAMPLE,
    question: "How often does a rep have to fix a fact before sending?",
    numerator: "approved decisions with at least one fact_correction edit",
    denominator: "approved decisions (clean + edited)",
    compute: (r) => rateResult(approved(r), (d) => d.editCategories.includes("fact_correction"), DEFAULT_MIN_SAMPLE),
  },
  {
    id: "rubber_stamp_rate", label: "Rubber-stamp rate", kind: "rate", source: "decisions", minSample: DEFAULT_MIN_SAMPLE,
    question: "Are clean approvals real reviews, or clicks without reading?",
    numerator: `clean approvals reviewed for under ${RUBBER_STAMP_MS / 1000}s`,
    denominator: "clean approvals",
    compute: (r) => rateResult(r.decisions.filter((d) => d.kind === "approved_clean"), (d) => !read(d), DEFAULT_MIN_SAMPLE),
  },
  {
    id: "reject_reason_mix", label: "Reject reason mix", kind: "rate", source: "decisions", minSample: 3,
    question: "Why do reps reject drafts?",
    numerator: "rejects with the most common reason",
    denominator: "all rejects",
    compute: (r) => {
      const rejects = r.decisions.filter((d) => d.kind === "rejected");
      const breakdown = breakdownOf(groupBy(rejects, (d) => d.rejectReason ?? "none"), () => true, 1, (k) => k.replace(/_/g, " "))
        // Each reason's share of all rejects, so the shares add up to 100%.
        .map((b) => ({ ...b, denominator: rejects.length, value: rejects.length > 0 ? b.numerator / rejects.length : null, ci95: wilson(b.numerator, rejects.length) }))
        .sort((a, b) => b.numerator - a.numerator);
      const top = breakdown[0]?.key;
      return { ...rateResult(rejects, (d) => (d.rejectReason ?? "none") === top, 3), breakdown };
    },
  },
  {
    id: "completion_rate", label: "Completion rate", kind: "rate", source: "decisions", minSample: DEFAULT_MIN_SAMPLE,
    question: "Once approved, does the job actually get done end to end?",
    numerator: "approved workflows that reached Completed",
    denominator: "approved decisions",
    compute: (r) => rateResult(approved(r), (d) => d.workflowState === "completed", DEFAULT_MIN_SAMPLE),
  },
  {
    id: "critical_error_count", label: "Critical errors (last 20)", kind: "count", source: "decisions", minSample: 0,
    question: "Did anything dangerous get through, or get caught, recently?",
    numerator: "critical-severity edits plus shield blocks",
    denominator: `the last ${TRUST_WINDOW} real events (decisions and shield blocks)`,
    compute: (r) => {
      // Always real data: this feeds the trust ladder gates.
      const events = [
        ...r.decisions.filter((d) => !d.isSynthetic).map((d) => ({ id: d.id, at: d.decidedAt, critical: d.editSeverities.includes("critical") })),
        ...r.blocks.filter((b) => !b.isSynthetic).map((b) => ({ id: b.id, at: b.at, critical: true })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, TRUST_WINDOW);
      const critical = events.filter((e) => e.critical);
      return { value: critical.length, numerator: critical.length, denominator: events.length, rowIds: events.map((e) => e.id), numeratorIds: critical.map((e) => e.id), realCount: events.length, syntheticCount: 0 };
    },
  },
];
