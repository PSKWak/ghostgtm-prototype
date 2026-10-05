import { SEED_ACCOUNTS } from "@/lib/db/seed";
import { rankFacts, type Standing } from "@/lib/engine/standing";

// Experiments run on the seed fact history, never the live database: every arm and
// every run sees exactly the same facts, even after reps have corrected the graph.
export function seedStanding(accountId: string): Standing {
  const seed = SEED_ACCOUNTS.find((a) => a.account.id === accountId);
  if (!seed) throw new Error(`no seed account ${accountId}`); // a label file naming a missing account is a bug
  return rankFacts(seed.facts.map((f) => ({ ...f, accountId, supersededBy: null, supersededReason: null })));
}

export const seedAccount = (accountId: string) => SEED_ACCOUNTS.find((a) => a.account.id === accountId)!;

export type ExperimentRowInput = {
  experiment: string; arm: string; caseId: string; runIndex: number; promptVersion: string | null; result: object; isSynthetic: boolean;
};
