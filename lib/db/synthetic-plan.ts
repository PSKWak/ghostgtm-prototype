import type { ClassifyMethod, DecisionKind, EditCategory, RejectReason, Severity } from "@/lib/engine/types";

// A deterministic four-week story for the demo: reps start out fixing facts and
// get steadily more clean approvals as the record improves. Nothing here is random,
// so every reset produces the same rows, and none of it is a measurement.

export type EditSample = { category: EditCategory; severity: Severity; method: ClassifyMethod; before: string; after: string };

const EDITS = {
  dateFix: { category: "fact_correction", severity: "critical", method: "rule", before: "March 31, 2027.", after: "December 31, 2026." },
  seatFix: { category: "fact_correction", severity: "major", method: "rule", before: "140 seats", after: "150 seats" },
  style: { category: "style", severity: "minor", method: "rule", before: "Thanks a ton", after: "Thank you" },
  styleLlm: { category: "style", severity: "minor", method: "llm", before: "Just circling back", after: "Following up" },
  missing: { category: "missing_context", severity: "major", method: "rule", before: "", after: "Jordan Lee from finance will join." },
  action: { category: "action_change", severity: "major", method: "llm", before: "set up a demo", after: "set up a workshop" },
  riskRemoval: { category: "risk_removal", severity: "major", method: "rule", before: "We'd love to discuss a bigger license tier.", after: "" },
} satisfies Record<string, EditSample>;
type EditKey = keyof typeof EDITS;

type Week = {
  clean: number; rubber: number; edited: EditKey[][]; rejected: RejectReason[];
  ignored: number; blocked: number; failed: number; firstTryFails: number;
};

// Oldest week first. Counts: 57 decisions (28 clean, 15 edited, 10 rejected, 4 ignored),
// 5 shield blocks, 1 failed write, 10 drafts that failed verify on the first try.
export const WEEKS: Week[] = [
  { clean: 3, rubber: 2, edited: [["dateFix"], ["seatFix"], ["style"], ["style", "missing"], ["action"]], rejected: ["wrong_fact", "wrong_fact", "bad_timing", "wrong_action"], ignored: 2, blocked: 1, failed: 0, firstTryFails: 4 },
  { clean: 5, rubber: 1, edited: [["dateFix"], ["style"], ["missing"], ["style"]], rejected: ["wrong_fact", "bad_timing", "too_risky"], ignored: 1, blocked: 2, failed: 1, firstTryFails: 3 },
  { clean: 7, rubber: 1, edited: [["styleLlm"], ["missing"], ["styleLlm"]], rejected: ["bad_timing", "too_risky"], ignored: 1, blocked: 1, failed: 0, firstTryFails: 2 },
  { clean: 9, rubber: 0, edited: [["styleLlm"], ["styleLlm"], ["riskRemoval"]], rejected: ["bad_timing"], ignored: 0, blocked: 1, failed: 0, firstTryFails: 1 },
];
export const SPAN_DAYS = WEEKS.length * 7;

export type PlannedDecision = {
  kind: DecisionKind; reviewMs: number; day: number; reason?: RejectReason; edits: EditSample[];
  failed: boolean; firstTryFail: boolean;
};

type Draftless = Omit<PlannedDecision, "day" | "failed" | "firstTryFail"> & { spread: number };

const mix = (w: Week): Draftless[] => [
  ...Array.from({ length: w.clean }, () => ({ kind: "approved_clean" as const, reviewMs: 12_000, spread: 8_000, edits: [] })),
  ...Array.from({ length: w.rubber }, () => ({ kind: "approved_clean" as const, reviewMs: 1_000, spread: 2_500, edits: [] })), // under RUBBER_STAMP_MS
  ...w.edited.map((keys) => ({ kind: "approved_edited" as const, reviewMs: 20_000, spread: 15_000, edits: keys.map((k) => EDITS[k]) })),
  ...w.rejected.map((reason) => ({ kind: "rejected" as const, reviewMs: 6_000, spread: 8_000, reason, edits: [] })),
  ...Array.from({ length: w.ignored }, () => ({ kind: "ignored" as const, reviewMs: 0, spread: 1, edits: [] })),
];

export function planDecisions(): PlannedDecision[] {
  let n = 0;
  return WEEKS.flatMap((w, wi) => {
    const base = mix(w);
    return base.map(({ spread, ...d }, i) => {
      n += 1;
      return {
        ...d, reviewMs: d.reviewMs + ((n * 7919) % spread), day: Math.floor(wi * 7 + (i * 7) / base.length),
        failed: i < w.failed, firstTryFail: i < w.firstTryFails, // clean approvals come first in each week
      };
    });
  });
}

// Weeks' shield blocks: a pitch to an account with an open escalation.
export const blockedDays = (): number[] => WEEKS.flatMap((w, wi) => Array.from({ length: w.blocked }, (_, i) => wi * 7 + 2 + i * 2));
