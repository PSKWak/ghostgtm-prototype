import { rankFacts } from "@/lib/engine/standing";
import type { Fact } from "@/lib/engine/types";
import type { Db } from "./client";
import * as t from "./schema";
import { brightline } from "./seed-data/brightline";
import { halcyon } from "./seed-data/halcyon";
import { ostrava } from "./seed-data/ostrava";
import type { SeedAccount } from "./seed-data/types";
import { walkthroughAccount } from "./seed-data/walkthrough";
import { seedSyntheticHistory } from "./seed-synthetic";
import { runWalkthrough } from "./seed-walkthrough";

export const SEED_ACCOUNTS: SeedAccount[] = [brightline, halcyon, ostrava];

export const SEED_USERS = [
  { id: "u_maya", name: "Maya Reyes", role: "rep" as const },
  { id: "u_sam", name: "Sam Ortiz", role: "manager" as const },
];

// The three accounts are the demo workspace that reps act on, so decisions made
// on them count as real. Generated history (experiments, backfills) sets is_synthetic.
const DEMO_IS_SYNTHETIC = false;

// Children before parents so foreign keys never block the wipe.
const TABLES_IN_DELETE_ORDER = [
  t.replayResults, t.testCases, t.outcomes, t.proposals, t.edits, t.executions,
  t.riskChecks, t.decisions, t.aiRuns, t.drafts, t.workflows, t.experimentRuns,
  t.facts, t.calls, t.contacts, t.accounts, t.users, t.settings,
] as const;

export type SeedOptions = {
  syntheticHistory?: boolean; // four weeks of flagged decisions for the Evals Console
  walkthrough?: boolean; // synthetic account copies taken through the full journey by the real flows
};

function toFacts(seed: SeedAccount): Fact[] {
  return seed.facts.map((f) => ({
    ...f, accountId: seed.account.id, supersededBy: null, supersededReason: null,
  }));
}

async function seedAccount(db: Db, seed: SeedAccount, isSynthetic: boolean): Promise<Fact[]> {
  await db.insert(t.accounts).values({ ...seed.account, isSynthetic });
  await db.insert(t.contacts).values(seed.contacts.map((c) => ({ ...c, accountId: seed.account.id })));
  await db.insert(t.calls).values({ ...seed.call, accountId: seed.account.id, occurredAt: new Date(seed.call.occurredAt), isSynthetic });
  // Rule 6: store losers with superseded_by + reason, computed by the same engine the app uses.
  const ranked = rankFacts(toFacts(seed)).facts;
  await db.insert(t.facts).values(ranked.map((f) => ({ ...f, observedAt: new Date(f.observedAt), isSynthetic })));
  return ranked;
}

export async function seedDemo(db: Db, opts: SeedOptions = {}): Promise<void> {
  await db.insert(t.users).values(SEED_USERS);
  const allFacts: Fact[] = [];
  for (const seed of SEED_ACCOUNTS) allFacts.push(...(await seedAccount(db, seed, DEMO_IS_SYNTHETIC)));
  if (opts.syntheticHistory) await seedSyntheticHistory(db, allFacts);
  if (opts.walkthrough) {
    const copies = SEED_ACCOUNTS.map(walkthroughAccount);
    for (const seed of copies) await seedAccount(db, seed, true);
    await runWalkthrough(db, copies.map((c) => c.account.id));
  }
}

export async function resetDemo(db: Db, opts: SeedOptions = {}): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of TABLES_IN_DELETE_ORDER) await tx.delete(table);
    await seedDemo(tx, opts);
  });
}
