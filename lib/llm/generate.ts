import { GENERATE_MODEL, VERIFY_MAX_RETRIES } from "@/lib/config";
import { fail, ok, type Draft, type Fact, type Result } from "@/lib/engine/types";
import { verifyDraft } from "@/lib/engine/verify";
import { fixtureDraft, recipientFor } from "./fixture";
import type { ModelCall } from "./model";
import { PROMPT_VERSIONS, type GenerateInput, type PromptVersionId } from "./prompts";

// Insight + draft in one call, verified per claim, retried once, then a cached
// run, then the grounded template. Every attempt is returned so the caller can
// log it in ai_runs (rule 8).

export type AttemptMode = "live" | "cached" | "fixture";
export type Attempt = {
  attempt: number; mode: AttemptMode; model: string; promptVersion: PromptVersionId;
  parseOk: boolean; verifyPassed: boolean; output: unknown; error?: string; latencyMs: number;
};
export type GenerationResult = {
  draft: Draft; insight: string; recipientContactId: string; promptVersion: PromptVersionId; mode: AttemptMode; attempts: Attempt[];
};
export type GenerateRequest = {
  accountId: string; promptVersion: PromptVersionId; input: GenerateInput; allFacts: Fact[]; excludeClaimIds: string[];
};
export type GenerateDeps = {
  mode: "fixture" | "live";
  callModel: ModelCall;
  loadCached: () => Promise<{ draft: Draft; insight: string }[]>; // newest first
};

const describeFailures = (draft: Draft, facts: Fact[]) =>
  verifyDraft(draft, facts).verdicts.filter((v) => v.label !== "supported")
    .map((v) => `"${draft.claims.find((c) => c.id === v.claimId)?.sentence}": ${v.reason}`);

async function liveAttempt(req: GenerateRequest, deps: GenerateDeps, attempt: number, feedback: string[]): Promise<Attempt & { result?: { draft: Draft; insight: string } }> {
  const prompt = PROMPT_VERSIONS[req.promptVersion];
  const started = Date.now();
  const base = { attempt, mode: "live" as const, promptVersion: req.promptVersion };
  try {
    const res = await deps.callModel({ system: prompt.system, prompt: prompt.build(req.input, feedback), schema: prompt.schema });
    const parsed = prompt.schema.safeParse(res.output); // rule 8: nothing is trusted unparsed
    const latencyMs = Date.now() - started;
    if (!parsed.success) return { ...base, model: res.model, parseOk: false, verifyPassed: false, output: res.output, error: parsed.error.issues[0]?.message, latencyMs };
    const result = prompt.toDraft(parsed.data);
    const verifyPassed = verifyDraft(result.draft, req.allFacts).passed;
    return { ...base, model: res.model, parseOk: true, verifyPassed, output: res.output, latencyMs, result };
  } catch (e) {
    return { ...base, model: GENERATE_MODEL, parseOk: false, verifyPassed: false, output: null, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started };
  }
}

async function fallback(req: GenerateRequest, deps: GenerateDeps, attempts: Attempt[]): Promise<Result<{ chosen: { draft: Draft; insight: string }; mode: AttemptMode }>> {
  const next = attempts.length + 1;
  for (const cached of await deps.loadCached()) {
    if (!verifyDraft(cached.draft, req.allFacts).passed) continue; // facts may have changed since
    attempts.push({ attempt: next, mode: "cached", model: GENERATE_MODEL, promptVersion: req.promptVersion, parseOk: true, verifyPassed: true, output: cached, latencyMs: 0 });
    return ok({ chosen: cached, mode: "cached" });
  }
  const fixture = fixtureDraft(req.accountId, req.input.facts, req.excludeClaimIds, req.promptVersion);
  if (!fixture) return fail(`no live draft passed and no fixture template for ${req.accountId}`);
  attempts.push({ attempt: next, mode: "fixture", model: "fixture-template", promptVersion: req.promptVersion, parseOk: true, verifyPassed: verifyDraft(fixture.draft, req.allFacts).passed, output: fixture, latencyMs: 0 });
  return ok({ chosen: fixture, mode: "fixture" });
}

export async function generateFollowUp(req: GenerateRequest, deps: GenerateDeps): Promise<Result<GenerationResult>> {
  const recipientContactId = recipientFor(req.accountId);
  if (!recipientContactId) return fail(`no recipient configured for ${req.accountId}`);
  const done = (chosen: { draft: Draft; insight: string }, mode: AttemptMode, attempts: Attempt[]) =>
    ok({ ...chosen, recipientContactId, promptVersion: req.promptVersion, mode, attempts });

  const attempts: Attempt[] = [];
  if (deps.mode === "live") {
    const prompt = PROMPT_VERSIONS[req.promptVersion];
    const maxAttempts = prompt.verifies ? 1 + VERIFY_MAX_RETRIES : 1;
    let feedback: string[] = [];
    for (let n = 1; n <= maxAttempts; n++) {
      const { result, ...attempt } = await liveAttempt(req, deps, n, feedback);
      attempts.push(attempt);
      // The baseline is not verified: whatever it writes is the arm's output.
      if (result && (attempt.verifyPassed || !prompt.verifies)) return done(result, "live", attempts);
      feedback = result ? describeFailures(result.draft, req.allFacts) : [`your output did not match the schema: ${attempt.error ?? "unknown error"}`];
    }
  }
  const chosen = await fallback(req, deps, attempts);
  return chosen.ok ? done(chosen.value.chosen, chosen.value.mode, attempts) : chosen;
}
