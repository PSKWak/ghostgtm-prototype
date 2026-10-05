import { and, desc, eq } from "drizzle-orm";
import { CACHED_RUN_LOOKBACK } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { hashDraft } from "@/lib/engine/hash";
import { transition } from "@/lib/engine/state-machine";
import { fail, ok, type Result, type WorkflowState } from "@/lib/engine/types";
import { verifyDraft } from "@/lib/engine/verify";
import { llmMode, type LlmMode } from "@/lib/llm/client";
import { recipientFor } from "@/lib/llm/fixture";
import { generateFollowUp, type GenerateDeps } from "@/lib/llm/generate";
import { callLiveModel, type ModelCall } from "@/lib/llm/model";
import { PROMPT_VERSIONS, type PromptVersionId } from "@/lib/llm/prompts";
import { getActivePromptVersion } from "@/lib/db/settings";
import { hasOpenEscalation, loadAccountContext, type AccountContext } from "./context";
import { newId } from "./ids";
import { replayActiveTests } from "./replay";
import { assessAllActions, strictest } from "./risk-input";

export type Generated = { workflowId: string; state: WorkflowState };
export type GenerateOptions = {
  excludeClaimIds?: string[]; // fixture redraft: template sentences to leave out
  avoid?: string[]; // live redraft: sentences the model must not repeat
  promptVersion?: PromptVersionId;
  callModel?: ModelCall; // tests inject a scripted model
  mode?: LlmMode; // the demo walkthrough always runs on fixtures, even when the app is live
  walkthrough?: boolean; // only the seed may draft on a synthetic walkthrough account
};

// Recent live drafts for this account and prompt, newest first; generate re-verifies them.
async function loadCached(db: Db, accountId: string, promptVersion: PromptVersionId) {
  const rows = await db.select({ output: t.aiRuns.output }).from(t.aiRuns)
    .innerJoin(t.workflows, eq(t.aiRuns.workflowId, t.workflows.id))
    .where(and(eq(t.workflows.accountId, accountId), eq(t.aiRuns.task, "generate"), eq(t.aiRuns.mode, "live"),
      eq(t.aiRuns.parseOk, true), eq(t.aiRuns.promptVersion, promptVersion)))
    .orderBy(desc(t.aiRuns.createdAt)).limit(CACHED_RUN_LOOKBACK);
  const prompt = PROMPT_VERSIONS[promptVersion];
  return rows.flatMap((r) => {
    const parsed = prompt.schema.safeParse(r.output);
    return parsed.success ? [prompt.toDraft(parsed.data)] : [];
  });
}

export async function buildInput(db: Db, ctx: AccountContext, avoid: string[]) {
  const recipient = ctx.contacts.find((c) => c.id === recipientFor(ctx.account.id));
  const [call] = await db.select().from(t.calls).where(eq(t.calls.accountId, ctx.account.id)).orderBy(desc(t.calls.occurredAt)).limit(1);
  return {
    accountName: ctx.account.name,
    recipient: { name: recipient?.name ?? "there", title: recipient?.title ?? "" },
    callDate: call ? call.occurredAt.toISOString().slice(0, 10) : null,
    transcript: call?.transcript ?? [],
    facts: ctx.standing.current,
    openEscalation: hasOpenEscalation(ctx.standing),
    avoid,
  };
}

// Context → draft → verify → risk. Ends awaiting approval, or blocked by the shield.
export async function generateWorkflow(db: Db, accountId: string, callId: string | null, opts: GenerateOptions = {}): Promise<Result<Generated>> {
  const ctx = await loadAccountContext(db, accountId);
  if (!ctx.ok) return ctx;
  // Work drafted by a person on a synthetic copy would be real work hidden among synthetic rows.
  if (ctx.value.account.isSynthetic && !opts.walkthrough) return fail("this is a finished synthetic walkthrough; draft on one of the live accounts");
  const promptVersion = opts.promptVersion ?? (await getActivePromptVersion(db));
  const deps: GenerateDeps = { mode: opts.mode ?? llmMode(), callModel: opts.callModel ?? callLiveModel, loadCached: () => loadCached(db, accountId, promptVersion) };
  const gen = await generateFollowUp({
    accountId, promptVersion, input: await buildInput(db, ctx.value, opts.avoid ?? []),
    allFacts: ctx.value.standing.facts, excludeClaimIds: opts.excludeClaimIds ?? [],
  }, deps);
  if (!gen.ok) return gen;
  const { draft, insight, recipientContactId, attempts } = gen.value;

  // Superseded facts are included so verify can label a stale citation "stale".
  const verification = verifyDraft(draft, ctx.value.standing.facts);
  const risks = assessAllActions(ctx.value, draft, verification.verdicts, recipientContactId, "none");
  const verdict = strictest(risks);
  const next = transition("created", verdict.verdict === "block" ? { type: "risk_blocked", reason: verdict.reason } : { type: "draft_ready" });
  if (!next.ok) return fail(next.reason);

  const workflowId = newId("wf");
  const factIds = ctx.value.standing.current.map((f) => f.id);
  await db.transaction(async (tx) => {
    await tx.insert(t.workflows).values({ id: workflowId, accountId, callId, state: next.value, promptVersion, recipientContactId, insight });
    // Rule 8: every attempt is logged, including failed parses and fallbacks.
    await tx.insert(t.aiRuns).values(attempts.map((a) => ({
      id: newId("run"), workflowId, task: "generate" as const, promptVersion: a.promptVersion, model: a.model, mode: a.mode,
      input: { accountId, factIds, promptVersion }, output: (a.output ?? null) as object | null, parseOk: a.parseOk,
      verifyPassedFirstTry: a.attempt === 1 ? a.verifyPassed : null, attempt: a.attempt, latencyMs: a.latencyMs,
    })));
    await tx.insert(t.drafts).values({ id: newId("d"), workflowId, version: 1, author: "agent", content: draft, contentHash: hashDraft(draft), verdicts: verification.verdicts });
    await tx.insert(t.riskChecks).values(risks.map(({ action, risk }) => ({ id: newId("rk"), workflowId, action, verdict: risk.verdict, rule: risk.rule, reason: risk.reason })));
    await replayActiveTests(tx, accountId, draft, promptVersion);
  });
  return ok({ workflowId, state: next.value });
}
