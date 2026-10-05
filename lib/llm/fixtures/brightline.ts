import type { DraftTemplate } from "@/lib/engine/templates";

// The renewal date is a placeholder on purpose: it is the fact a rep corrects,
// and the next draft must pick up the corrected value.
export const brightlineFollowUp: DraftTemplate = {
  accountId: "acct_brightline",
  recipientContactId: "ct_bf_dana",
  subject: "Following up on today's call",
  sentences: [
    { id: "hi", text: "Hi Dana,", factual: false },
    { id: "thanks", text: "Thanks for the time today.", factual: false },
    { id: "seats", text: "Great to hear all {seat_count} seats are live.", factual: true },
    { id: "docs", text: "As Luis asked, I'll send over the {requested_item} today.", factual: true },
    { id: "next", text: "Next step on our side: {next_step}.", factual: true },
    { id: "renewal", text: "I have your renewal down for {renewal_date}.", factual: true },
    { id: "budget", text: "I understand the budget owner for the expansion is not decided yet.", factKeys: ["budget_owner"], factual: true, onlyIfUnknown: "budget_owner" },
    { id: "bye", text: "Best, Maya", factual: false },
  ],
};
