import { isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { checkExpectation } from "@/lib/engine/replay";
import { ok, type Result } from "@/lib/engine/types";
import { llmMode } from "@/lib/llm/client";
import { generateFollowUp } from "@/lib/llm/generate";
import { callLiveModel, type ModelCall } from "@/lib/llm/model";
import { PROMPT_VERSIONS, type PromptVersionId } from "@/lib/llm/prompts";
import { loadAccountContext } from "./context";
import { buildInput } from "./generate";
import { newId } from "./ids";

// Runs every active regression test against every prompt version: the table that
// shows whether a prompt change would undo something reps already corrected.
export async function replayAll(db: Db, callModel: ModelCall = callLiveModel): Promise<Result<{ replayed: number }>> {
  const tests = await db.select().from(t.testCases).where(isNull(t.testCases.retiredBy));
  const accounts = [...new Set(tests.map((x) => x.accountId))];
  const mode = llmMode();
  let replayed = 0;
  for (const version of Object.keys(PROMPT_VERSIONS) as PromptVersionId[]) {
    for (const accountId of accounts) {
      const ctx = await loadAccountContext(db, accountId);
      if (!ctx.ok) continue;
      const gen = await generateFollowUp({
        accountId, promptVersion: version, input: await buildInput(db, ctx.value, []), allFacts: ctx.value.standing.facts, excludeClaimIds: [],
      }, { mode, callModel, loadCached: async () => [] });
      // Rule 8: every model call is logged, replay included.
      if (gen.ok && mode === "live") {
        await db.insert(t.aiRuns).values(gen.value.attempts.map((a) => ({
          id: newId("run"), task: "generate" as const, promptVersion: a.promptVersion, model: a.model, mode: a.mode,
          input: { accountId, purpose: "replay" }, output: (a.output ?? null) as object | null, parseOk: a.parseOk, attempt: a.attempt, latencyMs: a.latencyMs,
        })));
      }
      // A template fallback in live mode would pass for the wrong reason: count it as a failed replay.
      const usable = gen.ok && (mode === "fixture" || gen.value.mode === "live");
      for (const tc of tests.filter((x) => x.accountId === accountId)) {
        const result = usable && gen.ok ? checkExpectation(gen.value.draft, tc.expectation) : { passed: false, reason: gen.ok ? `live generation failed; fell back to ${gen.value.mode}` : gen.reason };
        await db.insert(t.replayResults).values({
          id: newId("rp"), testCaseId: tc.id, promptVersion: version, passed: result.passed,
          output: { reason: result.reason, draft: gen.ok ? gen.value.draft : null },
        });
        replayed++;
      }
    }
  }
  return ok({ replayed });
}
