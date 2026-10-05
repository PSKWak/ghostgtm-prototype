import { renderDraft } from "@/lib/engine/templates";
import type { Draft, Fact } from "@/lib/engine/types";
import { FOLLOW_UP_TEMPLATES } from "./fixtures";
import type { PromptVersionId } from "./prompts";

// Fixture generation: the template filled from today's facts. Always grounded by
// construction, so it is also the last-resort fallback for live mode.
export function fixtureDraft(accountId: string, facts: Fact[], excludeClaimIds: string[], promptVersion: PromptVersionId): { draft: Draft; insight: string } | null {
  const template = FOLLOW_UP_TEMPLATES[accountId];
  if (!template) return null;
  const rendered = renderDraft(template, facts);
  const claims = rendered.claims.filter((c) => !excludeClaimIds.includes(c.id));
  // The baseline arm cites at document level: every factual sentence carries every source.
  const sources = [...new Set(claims.flatMap((c) => c.factIds))];
  const shaped = promptVersion === "generate@baseline" ? claims.map((c) => (c.factual ? { ...c, factIds: sources } : c)) : claims;
  return { draft: { subject: rendered.subject, claims: shaped }, insight: template.insight };
}

export const recipientFor = (accountId: string) => FOLLOW_UP_TEMPLATES[accountId]?.recipientContactId ?? null;
