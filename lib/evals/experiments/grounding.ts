import { renderBody } from "@/lib/engine/hash";
import { fail, ok, type Draft, type Fact, type Result } from "@/lib/engine/types";
import { verifyDraft } from "@/lib/engine/verify";
import { seedAccount, seedStanding, type ExperimentRowInput } from "@/lib/evals/seed-facts";
import { hasOpenEscalation } from "@/lib/flow/context";
import { recipientFor } from "@/lib/llm/fixture";
import { generateFollowUp, type Attempt } from "@/lib/llm/generate";
import type { ModelCall } from "@/lib/llm/model";
import type { PromptVersionId } from "@/lib/llm/prompts";

// Grounding (experiments/grounding.md): claim-level evidence + verify vs document-level
// citations, same inputs and fact history, 10 runs per account per arm. Live only.

export type GroundingDeps = { mode: "fixture" | "live"; callModel: ModelCall; onAttempt?: (a: Attempt, accountId: string) => void };

const ARMS: { arm: string; version: PromptVersionId }[] = [{ arm: "method", version: "generate@v1" }, { arm: "baseline", version: "generate@baseline" }];
export const GROUNDING_ACCOUNTS = ["acct_brightline", "acct_halcyon", "acct_ostrava"];

// Per the pre-registration, the baseline gets the most generous reading of a
// document-level citation: every input fact id on every factual sentence.
function asLabeled(draft: Draft, arm: string, inputFacts: Fact[]): Draft {
  if (arm === "method") return draft;
  const all = inputFacts.map((f) => f.id);
  return { ...draft, claims: draft.claims.map((c) => (c.factual ? { ...c, factIds: all } : c)) };
}

function count(draft: Draft, facts: Fact[]) {
  const { verdicts } = verifyDraft(draft, facts);
  const by = (l: string) => verdicts.filter((v) => v.label === l).length;
  return { factualClaims: verdicts.length, noneClaims: by("none"), labels: { supported: by("supported"), partial: by("partial"), none: by("none"), stale: by("stale") } };
}

export async function runGrounding(deps: GroundingDeps, runsPerAccount = 10): Promise<Result<ExperimentRowInput[]>> {
  if (deps.mode !== "live") return fail("the grounding experiment needs LLM_MODE=live and an Anthropic key");
  const rows: ExperimentRowInput[] = [];
  for (const accountId of GROUNDING_ACCOUNTS) {
    const seed = seedAccount(accountId);
    const standing = seedStanding(accountId);
    const recipient = seed.contacts.find((c) => c.id === recipientFor(accountId));
    const input = {
      accountName: seed.account.name, recipient: { name: recipient?.name ?? "there", title: recipient?.title ?? "" },
      callDate: seed.call.occurredAt.slice(0, 10), transcript: seed.call.transcript, facts: standing.current,
      openEscalation: hasOpenEscalation(standing), avoid: [],
    };
    for (let run = 0; run < runsPerAccount; run++) {
      for (const { arm, version } of ARMS) {
        const gen = await generateFollowUp({ accountId, promptVersion: version, input, allFacts: standing.facts, excludeClaimIds: [] },
          { mode: "live", callModel: deps.callModel, loadCached: async () => [] });
        if (gen.ok) gen.value.attempts.filter((a) => a.mode === "live").forEach((a) => deps.onAttempt?.(a, accountId));
        const base = { experiment: "grounding", arm, caseId: `${accountId}#${run}`, runIndex: run, promptVersion: version, isSynthetic: false };
        // No fallback in an experiment: a template draft would score the template, not the prompt.
        if (!gen.ok || gen.value.mode !== "live") {
          rows.push({ ...base, result: { failed: true, error: gen.ok ? `generation fell back to ${gen.value.mode}` : gen.reason } });
          continue;
        }
        rows.push({ ...base, result: { ...count(asLabeled(gen.value.draft, arm, standing.current), standing.facts), attempts: gen.value.attempts.length, model: gen.value.attempts.at(-1)?.model ?? null, body: renderBody(gen.value.draft) } });
      }
    }
  }
  return ok(rows);
}
