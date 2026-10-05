import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";
import { generateWorkflow } from "@/lib/flow/generate";
import type { ModelCall } from "@/lib/llm/model";

let db: Db;
beforeEach(async () => {
  db = await openMemoryDb();
  await resetDemo(db);
  vi.stubEnv("LLM_MODE", "live");
});
afterEach(() => vi.unstubAllEnvs());

const draft = (factIds: string[]) => ({
  insight: "Renewal date needs checking.",
  subject: "Following up",
  sentences: [
    { text: "Hi Dana,", factIds: [], factual: false },
    { text: "Great to hear all 140 seats are live.", factIds, factual: true },
    { text: "Best, Maya", factIds: [], factual: false },
  ],
});
const model = (...outputs: object[]): ModelCall => async () => {
  const output = outputs.shift();
  if (!output) throw new Error("model unavailable");
  return { output, finishReason: "stop", model: "claude-opus-5-5" };
};
const runsOf = (wf: string) => db.select().from(t.aiRuns).where(eq(t.aiRuns.workflowId, wf)).orderBy(asc(t.aiRuns.attempt));

describe("live generate, logged in ai_runs (rule 8)", () => {
  it("logs one passing attempt and stores the insight", async () => {
    const r = await generateWorkflow(db, "acct_brightline", null, { callModel: model(draft(["f_bf_seats"])) });
    if (!r.ok) throw new Error(r.reason);
    const runs = await runsOf(r.value.workflowId);
    expect(runs).toEqual([expect.objectContaining({ attempt: 1, mode: "live", parseOk: true, verifyPassedFirstTry: true, promptVersion: "generate@v1", model: "claude-opus-5-5" })]);
    const [wf] = await db.select().from(t.workflows).where(eq(t.workflows.id, r.value.workflowId));
    expect(wf?.insight).toBe("Renewal date needs checking.");
  });

  it("logs a failed first try, the retry, and marks only attempt 1 for first-try grounding", async () => {
    const r = await generateWorkflow(db, "acct_brightline", null, { callModel: model(draft(["f_invented"]), draft(["f_bf_seats"])) });
    if (!r.ok) throw new Error(r.reason);
    const runs = await runsOf(r.value.workflowId);
    expect(runs.map((x) => [x.attempt, x.verifyPassedFirstTry])).toEqual([[1, false], [2, null]]);
  });

  it("falls back to an earlier live draft when the model is down", async () => {
    await generateWorkflow(db, "acct_brightline", null, { callModel: model(draft(["f_bf_seats"])) });
    const r = await generateWorkflow(db, "acct_brightline", null, { callModel: model() });
    if (!r.ok) throw new Error(r.reason);
    const runs = await runsOf(r.value.workflowId);
    expect(runs.map((x) => x.mode)).toEqual(["live", "live", "cached"]);
    expect(runs.slice(0, 2).every((x) => !x.parseOk)).toBe(true);
  });

  it("still produces a grounded draft from the template when nothing else works", async () => {
    const r = await generateWorkflow(db, "acct_ostrava", null, { callModel: model() });
    if (!r.ok) throw new Error(r.reason);
    expect((await runsOf(r.value.workflowId)).at(-1)).toMatchObject({ mode: "fixture", model: "fixture-template" });
    expect(r.value.state).toBe("awaiting_approval");
  });
});
