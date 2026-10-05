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

// Deterministic generation for experiments: the arms must differ only by method.
export const EXPERIMENT_TEMPERATURE = 0;
