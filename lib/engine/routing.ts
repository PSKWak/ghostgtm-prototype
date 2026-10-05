import type { EditCategory, FixRoute, RejectReason } from "./types";

// Each kind of feedback is fixed in a different place: wrong facts in the
// context graph, wording and action choice in the prompt, safety in policy,
// and timing problems are only logged (nothing in the system was wrong).
const EDIT_ROUTES: Record<EditCategory, FixRoute> = {
  fact_correction: "graph",
  missing_context: "graph",
  style: "prompt",
  action_change: "prompt",
  risk_removal: "policy",
};

const REJECT_ROUTES: Record<RejectReason, FixRoute> = {
  wrong_fact: "graph",
  wrong_action: "prompt",
  too_risky: "policy",
  bad_timing: "log",
};

export type Feedback =
  | { kind: "edit"; category: EditCategory }
  | { kind: "reject"; reason: RejectReason };

export const routeFeedback = (f: Feedback): FixRoute =>
  f.kind === "edit" ? EDIT_ROUTES[f.category] : REJECT_ROUTES[f.reason];
