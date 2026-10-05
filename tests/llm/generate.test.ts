import { describe, expect, it } from "vitest";
import { generateFollowUp, type GenerateDeps, type GenerateRequest } from "@/lib/llm/generate";
import type { ModelCall } from "@/lib/llm/model";
import { brightline } from "@/lib/db/seed-data/brightline";
import { rankFacts } from "@/lib/engine/standing";
import type { Fact } from "@/lib/engine/types";

const facts: Fact[] = rankFacts(brightline.facts.map((f) => ({ ...f, accountId: "acct_brightline", supersededBy: null, supersededReason: null }))).facts;
const current = facts.filter((f) => f.supersededBy === null);

const request = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  accountId: "acct_brightline", promptVersion: "generate@v1", excludeClaimIds: [], allFacts: facts,
  input: { accountName: "Brightline Freight", recipient: { name: "Dana Okafor", title: "VP Operations" }, callDate: "2026-10-01",
    transcript: brightline.call.transcript, facts: current, openEscalation: false, avoid: [] },
  ...over,
});

const good = {
  insight: "Security review is the gate to expansion.",
  subject: "Following up",
  sentences: [
    { text: "Hi Dana,", factIds: [], factual: false },
    { text: "Great to hear all 140 seats are live.", factIds: ["f_bf_seats"], factual: true },
    { text: "Best, Maya", factIds: [], factual: false },
  ],
};
const invented = { ...good, sentences: [good.sentences[0]!, { text: "All 140 seats are live.", factIds: ["f_made_up"], factual: true }, good.sentences[2]!] };

// A scripted model: returns the queued responses in order and records the prompts it saw.
function scripted(...responses: (object | Error)[]): ModelCall & { prompts: string[] } {
  const prompts: string[] = [];
  const call: ModelCall = async ({ prompt }) => {
    prompts.push(prompt);
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no response queued");
    return { output: next, finishReason: "stop", model: "claude-opus-5-5" };
  };
  return Object.assign(call, { prompts });
}

const deps = (callModel: ModelCall, cached: GenerateDeps["loadCached"] = async () => []): GenerateDeps =>
  ({ mode: "live", callModel, loadCached: cached });

describe("generateFollowUp (live)", () => {
  it("returns a verified draft from one call, with the insight", async () => {
    const r = await generateFollowUp(request(), deps(scripted(good)));
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.mode).toBe("live");
    expect(r.value.insight).toBe("Security review is the gate to expansion.");
    expect(r.value.attempts).toEqual([expect.objectContaining({ attempt: 1, mode: "live", parseOk: true, verifyPassed: true })]);
  });

  it("retries once with the failed checks in the prompt", async () => {
    const model = scripted(invented, good);
    const r = await generateFollowUp(request(), deps(model));
    expect(r.ok && r.value.attempts.map((a) => a.verifyPassed)).toEqual([false, true]);
    expect(model.prompts[1]).toContain("cites fact not in input: f_made_up");
  });

  it("records unparseable output and a thrown call as failed attempts", async () => {
    const r = await generateFollowUp(request(), deps(scripted({ nonsense: true }, new Error("overloaded"))));
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.attempts.slice(0, 2)).toEqual([
      expect.objectContaining({ attempt: 1, parseOk: false }),
      expect.objectContaining({ attempt: 2, parseOk: false, error: "overloaded" }),
    ]);
  });

  it("falls back to a cached run that still passes against today's facts", async () => {
    const cachedDraft = { subject: "Earlier", claims: [{ id: "s1", sentence: "All 140 seats are live.", factIds: ["f_bf_seats"], factual: true }] };
    const r = await generateFollowUp(request(), deps(scripted(invented, invented), async () => [{ draft: cachedDraft, insight: "cached" }]));
    expect(r.ok && r.value.mode).toBe("cached");
    expect(r.ok && r.value.draft.subject).toBe("Earlier");
  });

  it("falls back to the grounded template when nothing cached still holds", async () => {
    const stale = { subject: "Old", claims: [{ id: "s1", sentence: "All 99 seats are live.", factIds: ["f_bf_seats"], factual: true }] };
    const r = await generateFollowUp(request(), deps(scripted(invented, invented), async () => [{ draft: stale, insight: "x" }]));
    expect(r.ok && r.value.mode).toBe("fixture");
    expect(r.ok && r.value.attempts.at(-1)).toMatchObject({ mode: "fixture", verifyPassed: true });
  });

  it("runs the baseline once, unverified, with document-level citations", async () => {
    const model = scripted({ insight: "i", subject: "s", body: "Hi Dana,\nAll 140 seats are live. Your renewal is in March 2027.\nBest, Maya", sources: ["f_bf_seats", "f_bf_renewal_crm"] });
    const r = await generateFollowUp(request({ promptVersion: "generate@baseline" }), deps(model));
    if (!r.ok) throw new Error(r.reason);
    expect(model.prompts).toHaveLength(1);
    expect(r.value.draft.claims.filter((c) => c.factual).every((c) => c.factIds.length === 2)).toBe(true);
    expect(r.value.draft.claims[0]).toMatchObject({ sentence: "Hi Dana,", factual: false });
  });
});

describe("generateFollowUp (fixture)", () => {
  it("never calls the model", async () => {
    const model = scripted();
    const r = await generateFollowUp(request(), { ...deps(model), mode: "fixture" });
    expect(model.prompts).toHaveLength(0);
    expect(r.ok && r.value.mode).toBe("fixture");
  });
});

describe("prompt", () => {
  it("lists only current facts, by id, and marks unknowns", async () => {
    const model = scripted(good);
    await generateFollowUp(request(), deps(model));
    expect(model.prompts[0]).toContain("f_bf_renewal_crm | renewal_date | March 31, 2027");
    expect(model.prompts[0]).not.toContain("f_bf_renewal_call");
    expect(model.prompts[0]).toContain("f_bf_budget | budget_owner | UNKNOWN");
  });

  it("tells the model about an open escalation and sentences to avoid", async () => {
    const model = scripted(good);
    await generateFollowUp(request({ input: { ...request().input, openEscalation: true, avoid: ["Let's talk expansion."] } }), deps(model));
    expect(model.prompts[0]).toContain("OPEN support escalation");
    expect(model.prompts[0]).toContain("- Let's talk expansion.");
  });
});
