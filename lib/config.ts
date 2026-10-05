// Every tunable number lives here with the reason for its value.

// An approval faster than this is unlikely to include reading a ~120-word draft
// (average reading speed ~250 wpm ≈ 29s; 4s allows only a skim of the subject).
export const RUBBER_STAMP_MS = 4_000;

// Same-tier facts observed within this window that disagree are "contested",
// because neither is clearly newer information.
export const CONFLICT_WINDOW_DAYS = 30;

// One verify retry: a second failure is more likely a missing fact than a bad sample,
// so we fall back to the cached run instead of burning tokens.
export const VERIFY_MAX_RETRIES = 1;

// Below this trust level, risk.ts never auto-allows an unapproved action.
// Only the autonomy simulation reads this; the product always requires approval (rule 1).
export const AUTO_RUN_MIN_TRUST = 2;

// External email is not reversible, so it needs one level more than internal CRM notes.
export const AUTO_RUN_EMAIL_MIN_TRUST = 3;

// Trust ladder gates use the last N real decisions. 20 keeps the Wilson interval
// on a ~90% rate narrower than ±15 points.
export const TRUST_WINDOW = 20;

// Rates computed on fewer rows than this show "Not enough data (n=…)".
export const DEFAULT_MIN_SAMPLE = 5;

// The current default Claude model. It does not accept sampling parameters
// (temperature is rejected), so experiment arms are held equal by using the same
// model, effort, inputs and fact history instead of temperature 0.
export const GENERATE_MODEL = "claude-opus-5-5";

// A short follow-up from a dozen facts is routine writing; medium keeps cost and
// latency low. Raise it only if measured grounding improves.
export const GENERATE_EFFORT = "medium" as const;

// A follow-up email is ~150 words; this cap leaves room for thinking without risking
// truncated JSON.
export const GENERATE_MAX_OUTPUT_TOKENS = 16_000;

// How many recent passing live runs to consider for the cached fallback.
export const CACHED_RUN_LOOKBACK = 5;

// Trust ladder. Each level needs more real decisions and better quality than the
// one below. 10 / 20 / 40 decisions keep the Wilson half-width under roughly
// ±30 / ±20 / ±15 points at the target rates, enough to tell good from bad.
export const TRUST_LEVELS = [
  { level: 0, name: "Review everything", unlocks: "Every draft needs a rep's approval." },
  { level: 1, name: "Trusted drafts", unlocks: "Reps can skim; drafts are usually right.", minDecisions: 10, minCleanApproval: 0.5 },
  { level: 2, name: "Auto-log CRM notes", unlocks: "Internal CRM notes could run without review.", minDecisions: 20, minCleanApproval: 0.7, maxFactCorrection: 0.2, maxRubberStamp: 0.3 },
  // The lower bound of the interval, not the point estimate: a lucky streak shouldn't unlock sending.
  { level: 3, name: "Auto-send low-risk email", unlocks: "Grounded email to non-executives could send without review.", minDecisions: 40, minCleanApprovalLower: 0.75, minCompletion: 1, minWriteFidelity: 1 },
] as const;
