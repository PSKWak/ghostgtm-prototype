import { renderDraft } from "@/lib/engine/templates";
import { fail, ok, type Draft, type Fact, type Result } from "@/lib/engine/types";
import { FOLLOW_UP_TEMPLATES } from "./fixtures";

// Server-only entry point for generation. Phase 3 supports fixture mode only;
// live calls through the AI SDK arrive in Phase 4 behind the same signature.

export const GENERATE_PROMPT_VERSION = "generate@v1";

export type Generation = {
  draft: Draft;
  recipientContactId: string;
  mode: "fixture";
  model: string;
  promptVersion: string;
};

export const llmMode = () => (process.env.LLM_MODE ?? "fixture") as "fixture" | "live";

// excludeClaimIds: sentences a redraft must leave out (the ones the shield held).
export function generateFollowUp(accountId: string, currentFacts: Fact[], excludeClaimIds: string[] = []): Result<Generation> {
  if (llmMode() === "live") return fail("live generation arrives in Phase 4; set LLM_MODE=fixture");
  const template = FOLLOW_UP_TEMPLATES[accountId];
  if (!template) return fail(`no fixture template for ${accountId}`);
  const draft = renderDraft(template, currentFacts);
  return ok({
    draft: { ...draft, claims: draft.claims.filter((c) => !excludeClaimIds.includes(c.id)) },
    recipientContactId: template.recipientContactId,
    mode: "fixture",
    model: "fixture-template",
    promptVersion: GENERATE_PROMPT_VERSION,
  });
}
