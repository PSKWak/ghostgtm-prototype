import type { DraftTemplate } from "@/lib/engine/templates";
import { brightlineFollowUp } from "./brightline";
import { halcyonFollowUp } from "./halcyon";
import { ostravaFollowUp } from "./ostrava";

export const FOLLOW_UP_TEMPLATES: Record<string, DraftTemplate> = {
  acct_brightline: brightlineFollowUp,
  acct_halcyon: halcyonFollowUp,
  acct_ostrava: ostravaFollowUp,
};
