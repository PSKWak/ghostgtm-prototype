import { hashDraft } from "./hash";
import { renderLetter } from "./letter";
import type { ActionKind, Draft, ExecutionRecord } from "./types";

// Rule 4: executions are simulated. Every payload is derived from the approved
// draft and carries its hash, so a completed workflow provably wrote what was approved.

export type ExecutionPayload =
  | { kind: "email"; to: string; subject: string; body: string }
  | { kind: "note"; body: string }
  | { kind: "task"; title: string; dueDate: string };

export type ExecutionContext = { to: string | null; nextStep: string | null; now: string };

const TASK_DUE_DAYS = 7; // a follow-up task a week out keeps the next step visible in the CRM

function payloadFor(action: ActionKind, draft: Draft, ctx: ExecutionContext): ExecutionPayload {
  if (action === "send_email") return { kind: "email", to: ctx.to ?? "", subject: draft.subject, body: renderLetter(draft) };
  if (action === "log_crm_activity") return { kind: "note", body: `Follow-up sent: ${draft.subject}\n\n${renderLetter(draft)}` };
  const due = new Date(Date.parse(ctx.now) + TASK_DUE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return { kind: "task", title: ctx.nextStep ?? `Follow up on: ${draft.subject}`, dueDate: due };
}

export function simulateExecution(action: ActionKind, draft: Draft, ctx: ExecutionContext): { record: ExecutionRecord; payload: ExecutionPayload } {
  return { record: { action, status: "succeeded", contentHash: hashDraft(draft) }, payload: payloadFor(action, draft, ctx) };
}
