import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { isCommercial } from "@/lib/engine/commercial";
import { transition } from "@/lib/engine/state-machine";
import { fail, ok, type Result } from "@/lib/engine/types";
import { isPromptVersion } from "@/lib/llm/prompts";
import { generateWorkflow, type Generated } from "./generate";

// Replaces a draft the rep can't send: one the record has moved past (expired),
// or one the shield held (redrafted without the sentences it held). The old
// workflow keeps its state and its eval signal; the new draft is checked from scratch.
export async function redraftWorkflow(db: Db, workflowId: string): Promise<Result<Generated>> {
  const [wf] = await db.select().from(t.workflows).where(eq(t.workflows.id, workflowId));
  if (!wf) return fail(`unknown workflow ${workflowId}`);
  if (wf.state !== "awaiting_approval" && wf.state !== "blocked") return fail(`a ${wf.state} draft can't be redrafted`);

  const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, wf.id)).orderBy(desc(t.drafts.version)).limit(1);
  const held = wf.state === "blocked"
    ? (draft?.content.claims ?? []).filter((c) => isCommercial(c.sentence) || draft?.verdicts?.some((v) => v.claimId === c.id && (v.label === "none" || v.label === "stale"))).map((c) => c.id)
    : [];
  if (wf.state === "awaiting_approval") {
    const next = transition(wf.state, { type: "expire" });
    if (!next.ok) return next;
    const expired = await db.update(t.workflows).set({ state: next.value })
      .where(and(eq(t.workflows.id, wf.id), eq(t.workflows.state, "awaiting_approval"))).returning({ id: t.workflows.id });
    if (expired.length === 0) return fail("this draft was already decided");
  }
  const avoid = (draft?.content.claims ?? []).filter((c) => held.includes(c.id)).map((c) => c.sentence);
  const generated = await generateWorkflow(db, wf.accountId, wf.callId, { excludeClaimIds: held, avoid, promptVersion: isPromptVersion(wf.promptVersion) ? wf.promptVersion : undefined });
  return generated.ok ? ok(generated.value) : generated;
}
