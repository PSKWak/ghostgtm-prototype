import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { approveWorkflow } from "@/lib/flow/approve";
import { generateWorkflow } from "@/lib/flow/generate";
import type { ModelCall } from "@/lib/llm/model";

let db: Db;
beforeEach(async () => {
  db = await openMemoryDb();
  await resetDemo(db);
});
afterEach(() => vi.unstubAllEnvs());

const edits = [
  { id: "thanks", sentence: "Thank you for today." },
  { id: "pilot", sentence: "Congratulations on the pilot: 18% faster line changeover, a great result." },
];

async function approveOstrava(callModel?: ModelCall) {
  const g = await generateWorkflow(db, "acct_ostrava", null);
  if (!g.ok) throw new Error(g.reason);
  return approveWorkflow(db, { workflowId: g.value.workflowId, userId: "u_maya", reviewMs: 9000, now: new Date(Date.now() + 60_000).toISOString(),
    claimEdits: edits.filter((e) => e.id === "pilot"), confirmCorrections: false, callModel });
}

describe("leftover edits are classified when a draft is approved", () => {
  it("labels them by rule in fixture mode", async () => {
    const r = await approveOstrava();
    expect(r.ok && r.value.kind).toBe("done");
    const rows = await db.select().from(t.edits);
    expect(rows).toEqual([expect.objectContaining({ before: "changeover.", after: "changeover, a great result.", category: "style", method: "rule" })]);
    expect(await db.select().from(t.aiRuns).where(eq(t.aiRuns.task, "classify_edit"))).toHaveLength(0);
  });

  it("labels them by the model in live mode and logs the call", async () => {
    vi.stubEnv("LLM_MODE", "live");
    const model: ModelCall = async ({ schema }) => {
      // generate and classify share the model; answer whichever schema is asked for.
      const isClassify = schema.safeParse({ labels: [] }).success;
      const output = isClassify
        ? { labels: [{ index: 0, category: "style", severity: "minor", reason: "added praise" }] }
        : { insight: "i", subject: "s", sentences: [{ text: "Hi Petra,", factIds: [], factual: false }, { text: "Congratulations on the pilot: 18% faster line changeover.", factIds: ["f_or_pilot"], factual: true }, { text: "Best, Maya", factIds: [], factual: false }] };
      return { output, finishReason: "stop", model: "claude-opus-5-5" };
    };
    const g = await generateWorkflow(db, "acct_ostrava", null, { callModel: model });
    if (!g.ok) throw new Error(g.reason);
    const r = await approveWorkflow(db, { workflowId: g.value.workflowId, userId: "u_maya", reviewMs: 9000, now: new Date(Date.now() + 60_000).toISOString(),
      claimEdits: [{ id: "s2", sentence: "Congratulations on the pilot: 18% faster line changeover, a great result." }], confirmCorrections: false, callModel: model });
    expect(r.ok && r.value.kind).toBe("done");
    expect((await db.select().from(t.edits))[0]).toMatchObject({ category: "style", method: "llm" });
    const runs = await db.select().from(t.aiRuns).where(eq(t.aiRuns.task, "classify_edit"));
    expect(runs).toEqual([expect.objectContaining({ parseOk: true, promptVersion: "classify_edit@v1", workflowId: g.value.workflowId })]);
  });
});
