import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { toFact } from "@/lib/db/mappers";
import * as t from "@/lib/db/schema";
import { rankFacts, type Standing } from "@/lib/engine/standing";
import { fail, ok, type Result } from "@/lib/engine/types";

export type AccountContext = {
  account: typeof t.accounts.$inferSelect;
  contacts: (typeof t.contacts.$inferSelect)[];
  standing: Standing;
};

export async function loadAccountContext(db: Db, accountId: string): Promise<Result<AccountContext>> {
  const [account] = await db.select().from(t.accounts).where(eq(t.accounts.id, accountId));
  if (!account) return fail(`unknown account ${accountId}`);
  const contacts = await db.select().from(t.contacts).where(eq(t.contacts.accountId, accountId));
  const facts = (await db.select().from(t.facts).where(eq(t.facts.accountId, accountId))).map(toFact);
  return ok({ account, contacts, standing: rankFacts(facts) });
}

// An escalation is open while the current support_escalation fact says so.
export const hasOpenEscalation = (s: Standing) =>
  s.current.some((f) => f.key === "support_escalation" && /^open\b/i.test(f.value ?? ""));
