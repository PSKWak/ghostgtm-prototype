import { WALKTHROUGH_PREFIX } from "@/lib/llm/fixtures";
import type { SeedAccount } from "./types";

// What the walkthrough does on each copy (lib/db/seed-walkthrough.ts), shown under its name.
const STORY: Record<string, string> = {
  acct_brightline: "Walkthrough: the rep corrected the stale renewal date, the record updated, and the next draft got it right with no edit.",
  acct_halcyon: "Walkthrough: the shield held a pitch during the open P1; the redraft without it was approved and sent.",
  acct_ostrava: "Walkthrough: the rep rejected a draft over the disputed approver, then approved one with added context that became a test.",
};

// A synthetic copy of a demo account: same facts and call, every id prefixed, so the
// walkthrough can finish its journey without touching the accounts people click live.
export function walkthroughAccount(seed: SeedAccount): SeedAccount {
  const id = (x: string) => WALKTHROUGH_PREFIX + x;
  return {
    account: { ...seed.account, id: id(seed.account.id), name: `Walkthrough · ${seed.account.name}`, scenario: STORY[seed.account.id] ?? seed.account.scenario },
    contacts: seed.contacts.map((c) => ({ ...c, id: id(c.id) })),
    call: { ...seed.call, id: id(seed.call.id) },
    facts: seed.facts.map((f) => ({ ...f, id: id(f.id) })),
  };
}
