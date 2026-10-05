import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { transition } from "@/lib/engine/state-machine";
import { fail, ok, type RejectReason, type Result, type WorkflowState } from "@/lib/engine/types";
import { newId } from "./ids";

export type RejectInput = { workflowId: string; userId: string; reason: RejectReason; reviewMs: number; factKey?: string };

// Rule 2: a rejected workflow is terminal; the reason (and, for wrong_fact, which
// fact) is the eval signal that routes the fix.
export async function rejectWorkflow(db: Db, input: RejectInput): Promise<Result<WorkflowState>> {
  const [wf] = await db.select().from(t.workflows).where(eq(t.workflows.id, input.workflowId));
  if (!wf) return fail(`unknown workflow ${input.workflowId}`);
  const next = transition(wf.state, { type: "reject" });
  if (!next.ok) return next;
  if (input.factKey) {
    if (input.reason !== "wrong_fact") return fail("a fact can only be named for a wrong_fact rejection");
    const [draft] = await db.select().from(t.drafts).where(eq(t.drafts.workflowId, wf.id)).orderBy(desc(t.drafts.version)).limit(1);
    const citedIds = draft?.content.claims.flatMap((c) => c.factIds) ?? [];
    const cited = await db.select({ id: t.facts.id, key: t.facts.key }).from(t.facts).where(eq(t.facts.accountId, wf.accountId));
    if (!cited.some((f) => f.key === input.factKey && citedIds.includes(f.id))) return fail(`the draft doesn't cite ${input.factKey}`);
  }
  const reviewMs = Math.max(0, Math.min(input.reviewMs, Date.now() - wf.createdAt.getTime()));
  const done = await db.transaction(async (tx) => {
    const claimed = await tx.update(t.workflows).set({ state: next.value })
      .where(and(eq(t.workflows.id, wf.id), eq(t.workflows.state, "awaiting_approval"))).returning({ id: t.workflows.id });
    if (claimed.length === 0) return false;
    await tx.insert(t.decisions).values({
      id: newId("dec"), workflowId: wf.id, userId: input.userId, kind: "rejected",
      rejectReason: input.reason, rejectFactKey: input.factKey ?? null, reviewMs,
    });
    return true;
  });
  return done ? ok(next.value) : fail("this draft was already decided");
}
