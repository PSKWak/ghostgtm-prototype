import type { SeedAccount } from "./types";

// Scenario: conflicting claims. Web says 1,200 employees, the call says 450
// (resolved by standing). Two calls a week apart name different final approvers
// (same tier, inside the conflict window: contested, a human must decide).
export const ostrava: SeedAccount = {
  account: {
    id: "acct_ostrava",
    name: "Ostrava Robotics",
    domain: "ostravarobotics.cz",
    scenario: "Conflicting claims: headcount (web vs call) and two different final approvers.",
  },
  contacts: [
    { id: "ct_or_petra", name: "Petra Novak", email: "petra.novak@ostravarobotics.cz", title: "Head of Automation", isExecutive: false },
    { id: "ct_or_tomas", name: "Tomas Hruby", email: "tomas.hruby@ostravarobotics.cz", title: "CFO", isExecutive: true },
  ],
  call: {
    id: "call_or_2",
    occurredAt: "2026-09-30T09:00:00Z",
    transcript: [
      { ts: "00:01:05", speaker: "Maya Reyes (AE)", text: "Petra, good to talk again. Where did the pilot review land?" },
      { ts: "00:04:12", speaker: "Petra Novak", text: "The pilot cut line changeover time by 18 percent. The team is happy." },
      { ts: "00:06:40", speaker: "Petra Novak", text: "We're about 450 people now after the spin-off, so pricing should reflect that." },
      { ts: "00:09:55", speaker: "Petra Novak", text: "Tomas, our CFO, has final sign-off on anything over budget this year." },
      { ts: "00:12:30", speaker: "Maya Reyes (AE)", text: "Would a business case for Tomas help?" },
      { ts: "00:12:48", speaker: "Petra Novak", text: "Yes, a one-page ROI summary would be ideal." },
    ],
  },
  facts: [
    { id: "f_or_headcount_web", key: "employee_count", value: "1,200", source: "web", sourceRef: "web:company-profile", observedAt: "2026-08-20T00:00:00Z" },
    { id: "f_or_headcount_call", key: "employee_count", value: "450", source: "ai_inferred", sourceRef: "call_or_2@00:06:40", observedAt: "2026-09-30T09:06:40Z" },
    { id: "f_or_approver_1", key: "final_approver", value: "Petra Novak", source: "ai_inferred", sourceRef: "call_or_1@00:15:20", observedAt: "2026-09-23T09:15:20Z" },
    { id: "f_or_approver_2", key: "final_approver", value: "Tomas Hruby", source: "ai_inferred", sourceRef: "call_or_2@00:09:55", observedAt: "2026-09-30T09:09:55Z" },
    { id: "f_or_pilot", key: "pilot_result", value: "18% faster line changeover", source: "ai_inferred", sourceRef: "call_or_2@00:04:12", observedAt: "2026-09-30T09:04:12Z" },
    { id: "f_or_request", key: "requested_item", value: "One-page ROI summary for the CFO", source: "ai_inferred", sourceRef: "call_or_2@00:12:48", observedAt: "2026-09-30T09:12:48Z" },
    { id: "f_or_champion", key: "champion", value: "Petra Novak", source: "crm_explicit", sourceRef: "crm:contact/champion", observedAt: "2026-05-02T00:00:00Z" },
  ],
};
