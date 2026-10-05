import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { checkExpectation } from "@/lib/engine/replay";
import type { Draft } from "@/lib/engine/types";
import { newId } from "./ids";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Every new draft is checked against the account's active regression tests, so a
// test's status always reflects the latest draft, not the day it was created.
export async function replayActiveTests(tx: Db | Tx, accountId: string, draft: Draft, promptVersion: string): Promise<void> {
  const active = await tx.select().from(t.testCases)
    .where(and(eq(t.testCases.accountId, accountId), isNull(t.testCases.retiredBy)));
  if (active.length === 0) return;
  await tx.insert(t.replayResults).values(active.map((tc) => {
    const result = checkExpectation(draft, tc.expectation);
    return { id: newId("rp"), testCaseId: tc.id, promptVersion, passed: result.passed, output: { reason: result.reason, draft } };
  }));
}
