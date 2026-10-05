import type { DraftTemplate } from "@/lib/engine/templates";

// Cites the final approver, which two calls disagree on: needs a human's OK.
export const ostravaFollowUp: DraftTemplate = {
  accountId: "acct_ostrava",
  recipientContactId: "ct_or_petra",
  subject: "Pilot results and the ROI summary",
  insight: "The pilot worked; the deal now hinges on an ROI case for the CFO, but two calls disagree on who signs.",
  sentences: [
    { id: "hi", text: "Hi Petra,", factual: false },
    { id: "pilot", text: "Congratulations on the pilot: {pilot_result}.", factual: true },
    { id: "headcount", text: "Thanks for confirming you're about {employee_count} people after the spin-off; I'll size the proposal on that.", factual: true },
    { id: "roi", text: "I'll put together the one-page ROI summary this week.", factKeys: ["requested_item"], factual: true },
    { id: "approver", text: "I'll address it to {final_approver}, who you mentioned has final sign-off.", factual: true },
    { id: "bye", text: "Best, Maya", factual: false },
  ],
};
