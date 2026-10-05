import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { fail, ok, type Result } from "@/lib/engine/types";
import { newId } from "./ids";

// "Turn into test case": what a rep added to a draft must keep appearing in future
// drafts for that account. The test links back to the decision that created it.
export async function createTestCaseFromEdit(db: Db, editId: string): Promise<Result<{ testCaseId: string }>> {
  const [row] = await db.select({ edit: t.edits, workflow: t.workflows }).from(t.edits)
    .innerJoin(t.decisions, eq(t.edits.decisionId, t.decisions.id))
    .innerJoin(t.workflows, eq(t.decisions.workflowId, t.workflows.id))
    .where(eq(t.edits.id, editId));
  if (!row) return fail(`unknown edit ${editId}`);
  const mustContain = row.edit.after.trim().replace(/[.!?]+$/, "");
  if (mustContain === "") return fail("a removed sentence can't become a test; there is nothing to keep");

  const factKey = `edit:${editId}`;
  const existing = await db.select().from(t.testCases).where(and(eq(t.testCases.accountId, row.workflow.accountId), eq(t.testCases.sourceDecisionId, row.edit.decisionId)));
  if (existing.some((x) => x.expectation.factKey === factKey)) return fail("this edit is already a test case");

  const testCaseId = newId("tc");
  await db.insert(t.testCases).values({
    id: testCaseId, sourceDecisionId: row.edit.decisionId, accountId: row.workflow.accountId,
    name: `Keeps the rep's addition: "${mustContain}"`, expectation: { factKey, mustContain },
  });
  return ok({ testCaseId });
}
