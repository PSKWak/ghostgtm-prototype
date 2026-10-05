import type { ActionKind, DecisionKind, RejectReason, WorkflowState } from "./types";

// The six steps a rep sees on every workflow. Derived only from rows, never stored.

export type StepStatus = "done" | "current" | "todo" | "stopped";
export type JourneyStep = { key: string; label: string; status: StepStatus; detail?: string };

export type JourneyInput = {
  state: WorkflowState;
  decision: { kind: DecisionKind; rejectReason: RejectReason | null } | null;
  executed: ActionKind[];
  corrections: number;
  testsPassing: number;
};

const done = (key: string, label: string, detail?: string): JourneyStep => ({ key, label, status: "done", detail });
const step = (key: string, label: string, status: StepStatus, detail?: string): JourneyStep => ({ key, label, status, detail });

function reviewStep(i: JourneyInput): JourneyStep {
  if (i.state === "blocked" && !i.decision) return step("reviewed", "Reviewed", "stopped", "Held by Ghost before review");
  if (i.state === "expired") return step("reviewed", "Reviewed", "stopped", "Expired: the record changed, redrafted");
  if (i.decision?.kind === "rejected") return step("reviewed", "Reviewed", "stopped", `Rejected: ${i.decision.rejectReason ?? "no reason"}`);
  if (i.decision) return done("reviewed", "Reviewed", i.decision.kind === "approved_edited" ? "Approved with edits" : "Approved as written");
  return step("reviewed", "Reviewed", "current", "Waiting for the rep in Slack");
}

function learnStep(i: JourneyInput): JourneyStep {
  if (i.corrections > 0) return done("learned", "Learned", `${i.corrections} fact corrected · ${i.testsPassing} regression test passing`);
  if (i.decision) return done("learned", "Learned", "Decision recorded as eval data");
  if (i.state === "blocked") return done("learned", "Learned", "Shield block recorded");
  return step("learned", "Learned", "todo");
}

export function computeJourney(i: JourneyInput): JourneyStep[] {
  const stopped = i.state === "rejected" || i.state === "blocked" || i.state === "expired";
  const actionStep = (key: string, label: string, actions: ActionKind[]) =>
    actions.every((a) => i.executed.includes(a)) ? done(key, label, "Simulated") : step(key, label, stopped ? "stopped" : "todo");
  return [
    done("context", "Context", "Facts ranked by standing"),
    done("drafted", "Drafted", "Every sentence cites facts"),
    reviewStep(i),
    actionStep("sent", "Sent", ["send_email"]),
    actionStep("logged", "Logged in CRM", ["log_crm_activity", "create_crm_task"]),
    learnStep(i),
  ];
}
