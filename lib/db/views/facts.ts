import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { toFact } from "@/lib/db/mappers";
import * as t from "@/lib/db/schema";
import { rankFacts } from "@/lib/engine/standing";
import { formatValue } from "@/lib/engine/templates";
import type { FactSource } from "@/lib/engine/types";
import { factLabel } from "@/lib/format";

export type FactCell = { id: string; value: string; source: FactSource; sourceRef: string; observedAt: string; reason: string | null };
export type FactRow = {
  key: string;
  label: string;
  current: FactCell;
  older: FactCell[]; // kept with superseded_by + reason (rule 6)
  flag: { kind: "challenged" | "contested" | "corrected"; text: string } | null;
};

const cell = (f: ReturnType<typeof toFact>): FactCell => ({
  id: f.id, value: f.value === null ? "unknown" : formatValue(f.value), source: f.source,
  sourceRef: f.sourceRef, observedAt: f.observedAt.slice(0, 10), reason: f.supersededReason,
});

export async function loadFactBoard(db: Db, accountId: string): Promise<FactRow[]> {
  const rows = await db.select().from(t.facts).where(eq(t.facts.accountId, accountId)).orderBy(asc(t.facts.key));
  const standing = rankFacts(rows.map(toFact));
  return standing.current.map((cur) => {
    const older = standing.facts.filter((f) => f.key === cur.key && f.id !== cur.id).map(cell);
    const challenged = standing.challenged.find((c) => c.factId === cur.id);
    const contested = standing.contested.find((c) => c.factIds.includes(cur.id));
    const flag = cur.source === "human_approved" ? { kind: "corrected" as const, text: "Confirmed by a rep" }
      : challenged ? { kind: "challenged" as const, text: `Newer evidence says ${older.find((o) => challenged.byFactIds.includes(o.id))?.value ?? "otherwise"}` }
      : contested ? { kind: "contested" as const, text: "Sources disagree; needs a human call" }
      : null;
    return { key: cur.key, label: factLabel(cur.key), current: cell(cur), older, flag };
  });
}

export async function loadAccounts(db: Db) {
  return db.select({ id: t.accounts.id, name: t.accounts.name, scenario: t.accounts.scenario, isSynthetic: t.accounts.isSynthetic }).from(t.accounts).orderBy(asc(t.accounts.name));
}

export async function loadLatestCall(db: Db, accountId: string) {
  const [call] = await db.select().from(t.calls).where(eq(t.calls.accountId, accountId)).orderBy(desc(t.calls.occurredAt)).limit(1);
  return call ? { id: call.id, date: call.occurredAt.toISOString().slice(0, 10), transcript: call.transcript } : null;
}
