import { describe, expect, it } from "vitest";
import { computeJourney, type JourneyInput } from "@/lib/engine/journey";
import { simulateExecution } from "@/lib/engine/execute";
import { hashDraft } from "@/lib/engine/hash";

const base: JourneyInput = { state: "awaiting_approval", decision: null, executed: [], corrections: 0, testsPassing: 0 };
const statuses = (i: JourneyInput) => computeJourney(i).map((s) => s.status);

describe("computeJourney", () => {
  it("waits on review before approval", () => {
    expect(statuses(base)).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
  });

  it("shows the whole journey done after an edited approval with a correction", () => {
    const j = computeJourney({
      state: "completed", decision: { kind: "approved_edited", rejectReason: null },
      executed: ["send_email", "log_crm_activity", "create_crm_task"], corrections: 1, testsPassing: 1,
    });
    expect(j.every((s) => s.status === "done")).toBe(true);
    expect(j.at(-1)?.detail).toBe("1 fact corrected · 1 regression test passing");
  });

  it("stops at review on a reject but still records the learning signal", () => {
    const j = computeJourney({ ...base, state: "rejected", decision: { kind: "rejected", rejectReason: "wrong_fact" } });
    expect(j.map((s) => s.status)).toEqual(["done", "done", "stopped", "stopped", "stopped", "done"]);
    expect(j[2]?.detail).toBe("Rejected: wrong_fact");
  });

  it("marks a shield block as held before review", () => {
    expect(computeJourney({ ...base, state: "blocked" })[2]?.detail).toBe("Held by Ghost before review");
  });
});

describe("simulateExecution", () => {
  const draft = { subject: "Hi", claims: [{ id: "a", sentence: "All 140 seats are live.", factIds: ["f"], factual: true }] };
  const ctx = { to: "dana@x.com", nextStep: "Security review call", now: "2026-10-04T00:00:00Z" };

  it("stamps every action with the approved draft's hash (rule 3)", () => {
    for (const action of ["send_email", "log_crm_activity", "create_crm_task"] as const) {
      expect(simulateExecution(action, draft, ctx).record).toEqual({ action, status: "succeeded", contentHash: hashDraft(draft) });
    }
  });

  it("builds a task due a week out from the next step", () => {
    expect(simulateExecution("create_crm_task", draft, ctx).payload).toEqual({ kind: "task", title: "Security review call", dueDate: "2026-10-11" });
  });
});
