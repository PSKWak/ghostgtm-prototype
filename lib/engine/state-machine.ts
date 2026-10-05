import { fail, ok, type ActionKind, type ExecutionRecord, type Result, type RiskResult, type WorkflowState } from "./types";

export type WorkflowEvent =
  | { type: "draft_ready" }
  | { type: "risk_blocked"; reason: string }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "expire" }
  | { type: "start_execution"; approved: boolean; risk: RiskResult }
  | {
      type: "executions_finished";
      executions: ExecutionRecord[];
      approvedHash: string;
      requiredActions: ActionKind[];
    };

const TERMINAL: WorkflowState[] = ["completed", "rejected", "blocked", "failed", "expired"];

export const isTerminal = (s: WorkflowState) => TERMINAL.includes(s);

// Rule 3: completed only when every required action ran, succeeded, and wrote
// exactly the approved content.
export function isFaithfulCompletion(e: Extract<WorkflowEvent, { type: "executions_finished" }>): boolean {
  return e.requiredActions.every((action) => {
    const run = e.executions.find((x) => x.action === action);
    return run?.status === "succeeded" && run.contentHash === e.approvedHash;
  });
}

// Rules 1 and 2: execution needs an approved decision and an allow from risk.ts.
function startExecution(e: Extract<WorkflowEvent, { type: "start_execution" }>): Result<WorkflowState> {
  if (!e.approved) return fail("no approved decision on record");
  if (e.risk.verdict === "block") return ok("blocked");
  if (e.risk.verdict === "require_approval") return fail(`risk requires approval: ${e.risk.reason}`);
  return ok("executing");
}

export function transition(state: WorkflowState, event: WorkflowEvent): Result<WorkflowState> {
  const invalid = () => fail<WorkflowState>(`cannot ${event.type.replace("_", " ")} from ${state}`);
  if (isTerminal(state)) return invalid();

  switch (event.type) {
    case "draft_ready":
      return state === "created" ? ok("awaiting_approval") : invalid();
    case "risk_blocked":
      return state === "created" || state === "awaiting_approval" ? ok("blocked") : invalid();
    case "approve":
      return state === "awaiting_approval" ? ok("approved") : invalid();
    case "reject":
      return state === "awaiting_approval" ? ok("rejected") : invalid();
    // A blocked draft can also be replaced; it stays blocked, the replacement is a new workflow.
    case "expire":
      return state === "awaiting_approval" ? ok("expired") : invalid();
    case "start_execution":
      return state === "approved" ? startExecution(event) : invalid();
    case "executions_finished":
      if (state !== "executing") return invalid();
      return ok(isFaithfulCompletion(event) ? "completed" : "failed");
  }
}
