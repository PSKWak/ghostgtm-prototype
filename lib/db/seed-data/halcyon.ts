import type { SeedAccount } from "./types";

// Scenario: a P1 support escalation is open. An expansion interest from July is
// also on file, and a follow-up that pushes it now would damage the relationship.
export const halcyon: SeedAccount = {
  account: {
    id: "acct_halcyon",
    name: "Halcyon Clinics",
    domain: "halcyonclinics.org",
    scenario: "Open P1 support escalation; an older expansion signal must not be pushed now.",
  },
  contacts: [
    { id: "ct_hc_amara", name: "Amara Patel", email: "amara.patel@halcyonclinics.org", title: "Director of Clinical Operations", isExecutive: true },
    { id: "ct_hc_ben", name: "Ben Whitaker", email: "ben.whitaker@halcyonclinics.org", title: "IT Manager", isExecutive: false },
  ],
  call: {
    id: "call_hc_1",
    occurredAt: "2026-10-02T17:00:00Z",
    transcript: [
      { ts: "00:00:40", speaker: "Maya Reyes (AE)", text: "Amara, thanks for joining. I know this week has been rough." },
      { ts: "00:02:15", speaker: "Amara Patel", text: "The EHR sync has been failing since September 28th. Front desks are re-keying appointments." },
      { ts: "00:05:30", speaker: "Ben Whitaker", text: "Ticket SUP-4471. We need a written root-cause analysis by Friday, October 9th." },
      { ts: "00:08:02", speaker: "Amara Patel", text: "Until this is fixed I can't talk about adding sites. Please don't send me pricing." },
      { ts: "00:10:45", speaker: "Maya Reyes (AE)", text: "Understood. I'll make sure engineering gives you daily updates." },
      { ts: "00:11:20", speaker: "Ben Whitaker", text: "Daily updates at 9am Eastern would help." },
    ],
  },
  facts: [
    { id: "f_hc_escalation", key: "support_escalation", value: "Open P1: SUP-4471 EHR sync failing since 2026-09-28", source: "crm_explicit", sourceRef: "crm:ticket/SUP-4471", observedAt: "2026-09-28T13:00:00Z" },
    { id: "f_hc_rca", key: "requested_item", value: "Written root-cause analysis by 2026-10-09", source: "ai_inferred", sourceRef: "call_hc_1@00:05:30", observedAt: "2026-10-02T17:05:30Z" },
    { id: "f_hc_updates", key: "next_step", value: "Daily engineering updates at 9am ET", source: "ai_inferred", sourceRef: "call_hc_1@00:11:20", observedAt: "2026-10-02T17:11:20Z" },
    { id: "f_hc_expansion", key: "expansion_interest", value: "3 additional clinic sites", source: "ai_inferred", sourceRef: "call_hc_0@00:22:10", observedAt: "2026-07-15T16:22:10Z" },
    { id: "f_hc_pause", key: "commercial_status", value: "Paused by customer until escalation resolved", source: "ai_inferred", sourceRef: "call_hc_1@00:08:02", observedAt: "2026-10-02T17:08:02Z" },
    { id: "f_hc_arr", key: "arr", value: "$126,000", source: "crm_explicit", sourceRef: "crm:deal/arr", observedAt: "2026-04-01T00:00:00Z" },
    { id: "f_hc_champion", key: "champion", value: "Amara Patel", source: "crm_explicit", sourceRef: "crm:contact/champion", observedAt: "2026-01-20T00:00:00Z" },
  ],
};
