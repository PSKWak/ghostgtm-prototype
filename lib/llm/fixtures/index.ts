import type { DraftTemplate } from "@/lib/engine/templates";
import { brightlineFollowUp } from "./brightline";
import { halcyonFollowUp } from "./halcyon";
import { ostravaFollowUp } from "./ostrava";

// Ids of the synthetic walkthrough copies of each account (lib/db/seed-walkthrough.ts).
// A copy keeps the live demo accounts untouched while showing the finished journey.
export const WALKTHROUGH_PREFIX = "demo_";

const BASE = [brightlineFollowUp, halcyonFollowUp, ostravaFollowUp];

const walkthroughCopy = (t: DraftTemplate): DraftTemplate =>
  ({ ...t, accountId: WALKTHROUGH_PREFIX + t.accountId, recipientContactId: WALKTHROUGH_PREFIX + t.recipientContactId });

export const FOLLOW_UP_TEMPLATES: Record<string, DraftTemplate> = Object.fromEntries(
  [...BASE, ...BASE.map(walkthroughCopy)].map((t) => [t.accountId, t]),
);
