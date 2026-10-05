// Domain types shared by engine, db and views. Enums are string unions.

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(reason: string): Result<T> => ({ ok: false, reason });

// ---- Facts and standing ----------------------------------------------------

export const FACT_SOURCES = ["human_approved", "crm_explicit", "ai_inferred", "web"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export type Fact = {
  id: string;
  accountId: string;
  key: string; // "renewal_date", "employee_count", ...
  value: string | null; // null means "unknown" and must render as such
  source: FactSource;
  sourceRef: string; // "crm:field/renewal_date", "call_bf_1@00:12:40", ...
  observedAt: string; // ISO timestamp
  supersededBy: string | null;
  supersededReason: string | null;
};

// ---- Workflow ---------------------------------------------------------------

export const WORKFLOW_STATES = [
  "created",
  "awaiting_approval",
  "approved",
  "executing",
  "completed",
  "rejected",
  "blocked",
  "failed",
  "expired", // the record changed after drafting; a fresh draft replaces it
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const ACTIONS = ["send_email", "log_crm_activity", "create_crm_task"] as const;
export type ActionKind = (typeof ACTIONS)[number];
// Internal CRM writes are reversible; external email is not.
export const INTERNAL_ACTIONS: ActionKind[] = ["log_crm_activity", "create_crm_task"];

export const DECISION_KINDS = ["approved_clean", "approved_edited", "rejected", "ignored"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const REJECT_REASONS = ["wrong_fact", "wrong_action", "too_risky", "bad_timing"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const EDIT_CATEGORIES = [
  "fact_correction",
  "missing_context",
  "style",
  "action_change",
  "risk_removal",
] as const;
export type EditCategory = (typeof EDIT_CATEGORIES)[number];

export type Severity = "critical" | "major" | "minor";
export type ClassifyMethod = "rule" | "llm";

// Where a piece of feedback should be fixed.
export const FIX_ROUTES = ["graph", "prompt", "policy", "log"] as const;
export type FixRoute = (typeof FIX_ROUTES)[number];

// ---- Drafts and grounding ----------------------------------------------------

export type Claim = {
  id: string;
  sentence: string;
  factIds: string[];
  factual: boolean; // greetings, questions and sign-offs are not factual
};

export type Draft = {
  subject: string;
  claims: Claim[]; // the body is the claims joined in order
};

export const SUPPORT_LABELS = ["supported", "partial", "none", "stale"] as const;
export type SupportLabel = (typeof SUPPORT_LABELS)[number];

export type ClaimVerdict = { claimId: string; label: SupportLabel; reason: string };

// ---- Risk -------------------------------------------------------------------

export type RiskVerdict = "allow" | "require_approval" | "block";
export type RiskResult = { verdict: RiskVerdict; reason: string; rule: string };

// ---- Executions ---------------------------------------------------------------

export type ExecutionStatus = "succeeded" | "failed";
export type ExecutionRecord = {
  action: ActionKind;
  status: ExecutionStatus;
  contentHash: string;
};
