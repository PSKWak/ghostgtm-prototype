import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { hashDraft } from "@/lib/engine/hash";
import { transition } from "@/lib/engine/state-machine";
import { fail, ok, type Result, type WorkflowState } from "@/lib/engine/types";
import { verifyDraft } from "@/lib/engine/verify";
import { generateFollowUp } from "@/lib/llm/client";
import { loadAccountContext } from "./context";
import { newId } from "./ids";
import { replayActiveTests } from "./replay";
import { assessAllActions, strictest } from "./risk-input";

export type Generated = { workflowId: string; state: WorkflowState };

// Context → draft → verify → risk. Ends awaiting approval, or blocked by the shield.
export async function generateWorkflow(db: Db, accountId: string, callId: string | null, excludeClaimIds: string[] = []): Promise<Result<Generated>> {
  const ctx = await loadAccountContext(db, accountId);
  if (!ctx.ok) return ctx;
  const started = Date.now();
  const gen = generateFollowUp(accountId, ctx.value.standing.current, excludeClaimIds);
  if (!gen.ok) return gen;
  const { draft, recipientContactId, mode, model, promptVersion } = gen.value;

  // The generator only saw current facts; superseded ones are included so verify can label "stale".
  const verification = verifyDraft(draft, ctx.value.standing.facts);
  const risks = assessAllActions(ctx.value, draft, verification.verdicts, recipientContactId, "none");
  const verdict = strictest(risks);
  const next = transition("created", verdict.verdict === "block" ? { type: "risk_blocked", reason: verdict.reason } : { type: "draft_ready" });
  if (!next.ok) return fail(next.reason);

  const workflowId = newId("wf");
  await db.transaction(async (tx) => {
    await tx.insert(t.workflows).values({ id: workflowId, accountId, callId, state: next.value, promptVersion, recipientContactId });
    await tx.insert(t.aiRuns).values({
      id: newId("run"), workflowId, task: "generate", promptVersion, model, mode,
      input: { accountId, factIds: ctx.value.standing.current.map((f) => f.id) },
      output: draft, parseOk: true, verifyPassedFirstTry: verification.passed, latencyMs: Date.now() - started,
    });
    await tx.insert(t.drafts).values({
      id: newId("d"), workflowId, version: 1, author: "agent", content: draft,
      contentHash: hashDraft(draft), verdicts: verification.verdicts,
    });
    await tx.insert(t.riskChecks).values(risks.map(({ action, risk }) => ({
      id: newId("rk"), workflowId, action, verdict: risk.verdict, rule: risk.rule, reason: risk.reason,
    })));
    await replayActiveTests(tx, accountId, draft);
  });
  return ok({ workflowId, state: next.value });
}
