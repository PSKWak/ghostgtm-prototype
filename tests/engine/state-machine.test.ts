import { describe, expect, it } from "vitest";
import { transition, type WorkflowEvent } from "@/lib/engine/state-machine";
import type { ExecutionRecord, RiskResult, WorkflowState } from "@/lib/engine/types";

const allow: RiskResult = { verdict: "allow", reason: "approved by rep", rule: "human_approved" };
const block: RiskResult = { verdict: "block", reason: "recipient outside account domain", rule: "wrong_recipient" };
const needs: RiskResult = { verdict: "require_approval", reason: "contested fact", rule: "contested_fact" };

const run = (from: WorkflowState, ...events: WorkflowEvent[]) => {
  let state = from;
  for (const e of events) {
    const r = transition(state, e);
    if (!r.ok) return r;
    state = r.value;
  }
  return { ok: true as const, value: state };
};

const exec = (action: ExecutionRecord["action"], hash = "h1", status: ExecutionRecord["status"] = "succeeded"): ExecutionRecord =>
  ({ action, contentHash: hash, status });

const finished = (executions: ExecutionRecord[]): WorkflowEvent => ({
  type: "executions_finished", executions, approvedHash: "h1", requiredActions: ["send_email", "log_crm_activity"],
});

describe("workflow state machine", () => {
  it("runs the happy path to completed", () => {
    const r = run("created",
      { type: "draft_ready" },
      { type: "approve" },
      { type: "start_execution", approved: true, risk: allow },
      finished([exec("send_email"), exec("log_crm_activity")]));
    expect(r).toEqual({ ok: true, value: "completed" });
  });

  it("never executes without an approved decision (rule 1)", () => {
    const r = transition("awaiting_approval", { type: "start_execution", approved: true, risk: allow });
    expect(r.ok).toBe(false);
    const r2 = transition("approved", { type: "start_execution", approved: false, risk: allow });
    expect(r2).toEqual({ ok: false, reason: "no approved decision on record" });
  });

  it("never executes unless risk returns allow (rule 1)", () => {
    expect(transition("approved", { type: "start_execution", approved: true, risk: needs }))
      .toEqual({ ok: false, reason: "risk requires approval: contested fact" });
  });

  it("moves to blocked when risk blocks at execution time, and blocked is terminal (rule 2)", () => {
    expect(transition("approved", { type: "start_execution", approved: true, risk: block }))
      .toEqual({ ok: true, value: "blocked" });
    expect(transition("blocked", { type: "approve" }).ok).toBe(false);
  });

  it("can block before approval when the shield fires on the draft", () => {
    expect(transition("awaiting_approval", { type: "risk_blocked", reason: "x" })).toEqual({ ok: true, value: "blocked" });
  });

  it("treats rejected as terminal (rule 2)", () => {
    const r = run("awaiting_approval", { type: "reject" });
    expect(r).toEqual({ ok: true, value: "rejected" });
    expect(transition("rejected", { type: "start_execution", approved: true, risk: allow }).ok).toBe(false);
  });

  it("fails instead of completing when a content hash differs from the approved version (rule 3)", () => {
    expect(transition("executing", finished([exec("send_email", "tampered"), exec("log_crm_activity")])))
      .toEqual({ ok: true, value: "failed" });
  });

  it("fails when any execution failed or a required action is missing (rule 3)", () => {
    expect(transition("executing", finished([exec("send_email"), exec("log_crm_activity", "h1", "failed")])))
      .toEqual({ ok: true, value: "failed" });
    expect(transition("executing", finished([exec("send_email")]))).toEqual({ ok: true, value: "failed" });
  });

  it("expires a pending draft, and expired is terminal (never executes)", () => {
    expect(transition("awaiting_approval", { type: "expire" })).toEqual({ ok: true, value: "expired" });
    expect(transition("expired", { type: "approve" }).ok).toBe(false);
    expect(transition("approved", { type: "expire" }).ok).toBe(false);
  });

  it("rejects events that make no sense in the current state", () => {
    expect(transition("created", { type: "approve" })).toEqual({ ok: false, reason: "cannot approve from created" });
  });
});
