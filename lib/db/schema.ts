import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ActionKind,
  ClaimVerdict,
  ClassifyMethod,
  DecisionKind,
  Draft,
  EditCategory,
  ExecutionStatus,
  FactSource,
  RejectReason,
  RiskVerdict,
  Severity,
  WorkflowState,
} from "@/lib/engine/types";
import type { ExecutionPayload } from "@/lib/engine/execute";

// Text ids with readable prefixes ("wf_812") so they can be quoted in the UI.
const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// Rule 10: every row that can feed a metric says whether it is synthetic.
const isSynthetic = () => boolean("is_synthetic").notNull().default(false);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  role: text("role").$type<"rep" | "manager">().notNull(),
});

export const accounts = pgTable("accounts", {
  id: id(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  scenario: text("scenario").notNull(), // one line describing the demo situation
  isSynthetic: isSynthetic(),
});

export const contacts = pgTable("contacts", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  title: text("title").notNull(),
  isExecutive: boolean("is_executive").notNull().default(false),
});

export type TranscriptLine = { ts: string; speaker: string; text: string };

export const calls = pgTable("calls", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  transcript: jsonb("transcript").$type<TranscriptLine[]>().notNull(),
  isSynthetic: isSynthetic(),
});

export const facts = pgTable(
  "facts",
  {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  key: text("key").notNull(),
  value: text("value"), // null = unknown
  source: text("source").$type<FactSource>().notNull(),
  sourceRef: text("source_ref").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  supersededBy: text("superseded_by"),
  supersededReason: text("superseded_reason"),
  confirmedBy: text("confirmed_by").references(() => users.id),
  isSynthetic: isSynthetic(),
}, (t) => [
  // Rule 7: nothing becomes human_approved without a named human confirming it.
  check("human_approved_needs_confirm", sql`${t.source} <> 'human_approved' OR ${t.confirmedBy} IS NOT NULL`),
]);

export const workflows = pgTable("workflows", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  callId: text("call_id").references(() => calls.id),
  state: text("state").$type<WorkflowState>().notNull(),
  promptVersion: text("prompt_version").notNull(),
  recipientContactId: text("recipient_contact_id").references(() => contacts.id),
  createdAt: createdAt(),
  isSynthetic: isSynthetic(),
});

export const drafts = pgTable("drafts", {
  id: id(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  version: integer("version").notNull(),
  author: text("author").$type<"agent" | "rep">().notNull(),
  content: jsonb("content").$type<Draft>().notNull(),
  contentHash: text("content_hash").notNull(),
  verdicts: jsonb("verdicts").$type<ClaimVerdict[]>(),
  createdAt: createdAt(),
});

export const decisions = pgTable("decisions", {
  id: id(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind").$type<DecisionKind>().notNull(),
  rejectReason: text("reject_reason").$type<RejectReason>(),
  rejectFactKey: text("reject_fact_key"), // which fact was wrong, so a wrong_fact reject can route to the graph
  approvedDraftId: text("approved_draft_id").references(() => drafts.id),
  reviewMs: integer("review_ms").notNull(),
  decidedAt: createdAt(),
  isSynthetic: isSynthetic(),
});

export const edits = pgTable("edits", {
  id: id(),
  decisionId: text("decision_id").notNull().references(() => decisions.id),
  before: text("before").notNull(),
  after: text("after").notNull(),
  // Null until classified: rule-based fact edits are classified at once,
  // other wording changes wait for the LLM pass (Phase 5).
  category: text("category").$type<EditCategory>(),
  severity: text("severity").$type<Severity>(),
  method: text("method").$type<ClassifyMethod>(),
  claimId: text("claim_id"),
  factId: text("fact_id").references(() => facts.id),
});

export const riskChecks = pgTable("risk_checks", {
  id: id(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  action: text("action").$type<ActionKind>().notNull(),
  verdict: text("verdict").$type<RiskVerdict>().notNull(),
  rule: text("rule").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const executions = pgTable(
  "executions",
  {
    id: id(),
    workflowId: text("workflow_id").notNull().references(() => workflows.id),
    action: text("action").$type<ActionKind>().notNull(),
    draftId: text("draft_id").notNull().references(() => drafts.id),
    contentHash: text("content_hash").notNull(),
    status: text("status").$type<ExecutionStatus>().notNull(),
    payload: jsonb("payload").$type<ExecutionPayload>().notNull(),
    simulated: boolean("simulated").notNull().default(true), // rule 4: always simulated
    executedAt: createdAt(),
  },
  // Rule 4: a retry can never send the same action twice.
  (t) => [uniqueIndex("executions_workflow_action").on(t.workflowId, t.action)],
);

export const proposals = pgTable("proposals", {
  id: id(),
  decisionId: text("decision_id").notNull().references(() => decisions.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  factKey: text("fact_key").notNull(),
  currentFactId: text("current_fact_id").references(() => facts.id),
  proposedValue: text("proposed_value").notNull(),
  status: text("status").$type<"pending" | "confirmed" | "dismissed">().notNull(),
  resolvedBy: text("resolved_by").references(() => users.id),
  createdAt: createdAt(),
});

export const aiRuns = pgTable("ai_runs", {
  id: id(),
  workflowId: text("workflow_id").references(() => workflows.id),
  task: text("task").$type<"generate" | "verify" | "classify_edit">().notNull(),
  promptVersion: text("prompt_version").notNull(), // rule 8
  model: text("model").notNull(),
  mode: text("mode").$type<"live" | "fixture" | "cached">().notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  parseOk: boolean("parse_ok").notNull(),
  verifyPassedFirstTry: boolean("verify_passed_first_try"),
  attempt: integer("attempt").notNull().default(1),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: createdAt(),
  isSynthetic: isSynthetic(),
});

export const testCases = pgTable("test_cases", {
  id: id(),
  sourceDecisionId: text("source_decision_id").references(() => decisions.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  expectation: jsonb("expectation").$type<{ factKey: string; mustContain: string }>().notNull(),
  // A newer confirmed correction of the same fact retires this test instead of leaving it to fail.
  retiredBy: text("retired_by"),
  createdAt: createdAt(),
});

export const replayResults = pgTable("replay_results", {
  id: id(),
  testCaseId: text("test_case_id").notNull().references(() => testCases.id),
  promptVersion: text("prompt_version").notNull(),
  passed: boolean("passed").notNull(),
  output: jsonb("output"),
  ranAt: createdAt(),
});

export const experimentRuns = pgTable("experiment_runs", {
  id: id(),
  experiment: text("experiment").notNull(), // "grounding" | "feedback" | "autonomy"
  arm: text("arm").notNull(), // "baseline" | "method" | named policy
  caseId: text("case_id").notNull(),
  runIndex: integer("run_index").notNull(),
  promptVersion: text("prompt_version"),
  result: jsonb("result").notNull(),
  createdAt: createdAt(),
  isSynthetic: isSynthetic(),
});

export const outcomes = pgTable("outcomes", {
  id: id(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  kind: text("kind").$type<"replied" | "meeting_booked" | "stage_moved" | "no_response">().notNull(),
  recordedBy: text("recorded_by").notNull().references(() => users.id), // manual tracker
  recordedAt: createdAt(),
});
