import type { SeedAccount } from "./types";

// Scenario: the CRM renewal date (March 2027) was entered in 2025 and is stale.
// On the call the champion says procurement moved renewal to Dec 31, 2026.
// Standing ranks the CRM value first, so the agent repeats it until a rep corrects it.
export const brightline: SeedAccount = {
  account: {
    id: "acct_brightline",
    name: "Brightline Freight",
    domain: "brightlinefreight.com",
    scenario: "Stale renewal date: CRM says March 2027, the call says Dec 31, 2026.",
  },
  contacts: [
    { id: "ct_bf_dana", name: "Dana Okafor", email: "dana.okafor@brightlinefreight.com", title: "VP Operations", isExecutive: true },
    { id: "ct_bf_luis", name: "Luis Ferreira", email: "luis.ferreira@brightlinefreight.com", title: "IT Security Lead", isExecutive: false },
  ],
  call: {
    id: "call_bf_1",
    occurredAt: "2026-10-01T15:00:00Z",
    transcript: [
      { ts: "00:01:10", speaker: "Maya Reyes (AE)", text: "Thanks for making time, Dana. I wanted to check how the dispatch rollout is going." },
      { ts: "00:03:42", speaker: "Dana Okafor", text: "All 140 seats are live. The night shift adopted it faster than we expected." },
      { ts: "00:09:15", speaker: "Luis Ferreira", text: "Before we expand, security needs your SOC 2 Type II report and the API rate-limit doc." },
      { ts: "00:14:05", speaker: "Dana Okafor", text: "Heads up, procurement pulled our renewal forward. It's December 31st this year now, not March." },
      { ts: "00:16:30", speaker: "Maya Reyes (AE)", text: "Understood. Should we set up a security review call?" },
      { ts: "00:16:52", speaker: "Luis Ferreira", text: "Yes, the week of October 12th works for us." },
      { ts: "00:18:20", speaker: "Dana Okafor", text: "I'm not sure who owns budget for the expansion yet. Let me find out." },
    ],
  },
  facts: [
    { id: "f_bf_renewal_crm", key: "renewal_date", value: "2027-03-31", source: "crm_explicit", sourceRef: "crm:deal/renewal_date", observedAt: "2025-03-14T00:00:00Z" },
    { id: "f_bf_renewal_call", key: "renewal_date", value: "2026-12-31", source: "ai_inferred", sourceRef: "call_bf_1@00:14:05", observedAt: "2026-10-01T15:14:05Z" },
    { id: "f_bf_seats", key: "seat_count", value: "140", source: "crm_explicit", sourceRef: "crm:account/seats", observedAt: "2026-06-01T00:00:00Z" },
    { id: "f_bf_arr", key: "arr", value: "$84,000", source: "crm_explicit", sourceRef: "crm:deal/arr", observedAt: "2026-06-01T00:00:00Z" },
    { id: "f_bf_champion", key: "champion", value: "Dana Okafor", source: "crm_explicit", sourceRef: "crm:contact/champion", observedAt: "2026-02-10T00:00:00Z" },
    { id: "f_bf_request", key: "requested_item", value: "SOC 2 Type II report and API rate-limit doc", source: "ai_inferred", sourceRef: "call_bf_1@00:09:15", observedAt: "2026-10-01T15:09:15Z" },
    { id: "f_bf_next", key: "next_step", value: "Security review call, week of 2026-10-12", source: "ai_inferred", sourceRef: "call_bf_1@00:16:52", observedAt: "2026-10-01T15:16:52Z" },
    { id: "f_bf_budget", key: "budget_owner", value: null, source: "ai_inferred", sourceRef: "call_bf_1@00:18:20", observedAt: "2026-10-01T15:18:20Z" },
  ],
};
