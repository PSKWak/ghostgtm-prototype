import { eq, inArray, sql } from "drizzle-orm";
import { WALKTHROUGH_STEP_MINUTES } from "@/lib/config";
import { approveWorkflow, type ApproveRequest } from "@/lib/flow/approve";
import { generateWorkflow } from "@/lib/flow/generate";
import { redraftWorkflow } from "@/lib/flow/redraft";
import { rejectWorkflow } from "@/lib/flow/reject";
import { createTestCaseFromEdit } from "@/lib/flow/test-cases";
import { WALKTHROUGH_PREFIX } from "@/lib/llm/fixtures";
import type { Db } from "./client";
import * as t from "./schema";

// Takes the synthetic account copies through the whole journey with the same flow
// functions the UI calls, so every row on screen came from real engine code. Always
// on fixtures: free, deterministic, and never a paid model call during a reset.
// Every row is then flagged is_synthetic (rule 10): views badge it, trust ignores it.

const MODE = "fixture" as const;
const REP = "u_maya";
const id = (accountId: string) => WALKTHROUGH_PREFIX + accountId;
const after = (ms: number) => new Date(Date.now() + ms).toISOString(); // a decision lands after its review time

type Run = { db: Db; workflows: string[] }; // workflows in the order the story created them

function must<T>(r: { ok: true; value: T } | { ok: false; reason: string }, step: string): T {
  if (!r.ok) throw new Error(`walkthrough step "${step}" failed: ${r.reason}`); // a seed bug, not an expected case
  return r.value;
}

async function draft(run: Run, accountId: string) {
  const { workflowId } = must(await generateWorkflow(run.db, id(accountId), null, { mode: MODE, walkthrough: true }), `draft ${accountId}`);
  run.workflows.push(workflowId);
  return workflowId;
}

async function approve(run: Run, workflowId: string, reviewMs: number, extra: Partial<ApproveRequest> = {}) {
  const r = must(await approveWorkflow(run.db, {
    workflowId, userId: REP, reviewMs, now: after(reviewMs), claimEdits: [], confirmCorrections: false, mode: MODE, ...extra,
  }), `approve ${workflowId}`);
  if (r.kind !== "done") throw new Error(`walkthrough approve stopped at "${r.kind}"`);
}

async function brightline(run: Run) {
  // The rep fixes the stale renewal date: the graph is corrected and a regression test is born.
  await approve(run, await draft(run, "acct_brightline"), 24_000, {
    claimEdits: [{ id: "renewal", sentence: "I have your renewal down for December 31, 2026." }], confirmCorrections: true,
  });
  // The next draft states the corrected date on its own and is approved as written.
  await approve(run, await draft(run, "acct_brightline"), 12_000);
}

async function halcyon(run: Run) {
  // The shield holds a pitch during the open P1; the redraft without it goes out.
  const held = await draft(run, "acct_halcyon");
  const redraft = must(await redraftWorkflow(run.db, held, { mode: MODE, walkthrough: true }), "redraft halcyon");
  run.workflows.push(redraft.workflowId);
  await approve(run, redraft.workflowId, 18_000);
}

async function ostrava(run: Run) {
  // Two calls disagree on the approver: the rep rejects, then approves a redraft with added context.
  const first = await draft(run, "acct_ostrava");
  must(await rejectWorkflow(run.db, { workflowId: first, userId: REP, reason: "wrong_fact", reviewMs: 9_000, factKey: "final_approver", now: after(9_000) }), "reject ostrava");
  const second = await draft(run, "acct_ostrava");
  await approve(run, second, 31_000, {
    claimEdits: [{ id: "roi", sentence: "I'll put together the one-page ROI summary this week, including Jana Svoboda's maintenance savings." }],
  });
  const [decision] = await run.db.select().from(t.decisions).where(eq(t.decisions.workflowId, second));
  const [edit] = decision ? await run.db.select().from(t.edits).where(eq(t.edits.decisionId, decision.id)) : [];
  if (edit) must(await createTestCaseFromEdit(run.db, edit.id), "ostrava test case");
}

// The story runs in milliseconds; moving each workflow's rows back together, earliest
// furthest, makes the views read in story order without reordering anything inside one.
async function spreadOverTime(run: Run): Promise<void> {
  const n = run.workflows.length;
  for (const [i, wf] of run.workflows.entries()) {
    const back = sql`make_interval(mins => ${(n - i) * WALKTHROUGH_STEP_MINUTES})`;
    await run.db.update(t.workflows).set({ createdAt: sql`${t.workflows.createdAt} - ${back}` }).where(eq(t.workflows.id, wf));
    await run.db.update(t.drafts).set({ createdAt: sql`${t.drafts.createdAt} - ${back}` }).where(eq(t.drafts.workflowId, wf));
    await run.db.update(t.aiRuns).set({ createdAt: sql`${t.aiRuns.createdAt} - ${back}` }).where(eq(t.aiRuns.workflowId, wf));
    await run.db.update(t.riskChecks).set({ createdAt: sql`${t.riskChecks.createdAt} - ${back}` }).where(eq(t.riskChecks.workflowId, wf));
    await run.db.update(t.decisions).set({ decidedAt: sql`${t.decisions.decidedAt} - ${back}` }).where(eq(t.decisions.workflowId, wf));
    await run.db.update(t.executions).set({ executedAt: sql`${t.executions.executedAt} - ${back}` }).where(eq(t.executions.workflowId, wf));
  }
}

async function flagSynthetic(db: Db, accountIds: string[], workflowIds: string[]): Promise<void> {
  await db.update(t.workflows).set({ isSynthetic: true }).where(inArray(t.workflows.id, workflowIds));
  await db.update(t.decisions).set({ isSynthetic: true }).where(inArray(t.decisions.workflowId, workflowIds));
  await db.update(t.aiRuns).set({ isSynthetic: true }).where(inArray(t.aiRuns.workflowId, workflowIds));
  await db.update(t.facts).set({ isSynthetic: true }).where(inArray(t.facts.accountId, accountIds)); // the rep-confirmed fact too
}

export async function runWalkthrough(db: Db, accountIds: string[]): Promise<void> {
  const run: Run = { db, workflows: [] };
  await brightline(run);
  await halcyon(run);
  await ostrava(run);
  await spreadOverTime(run);
  await flagSynthetic(db, accountIds, run.workflows);
}
