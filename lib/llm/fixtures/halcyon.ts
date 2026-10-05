import type { DraftTemplate } from "@/lib/engine/templates";

// Deliberately includes the expansion line an over-eager agent would write:
// the shield must block it while the escalation is open.
export const halcyonFollowUp: DraftTemplate = {
  accountId: "acct_halcyon",
  recipientContactId: "ct_hc_ben",
  subject: "SUP-4471: next steps",
  insight: "The account is at risk until SUP-4471 is fixed; Amara asked for no pricing until then.",
  sentences: [
    { id: "hi", text: "Hi Ben,", factual: false },
    { id: "sorry", text: "I'm sorry the EHR sync has been failing; engineering is treating SUP-4471 as a P1.", factKeys: ["support_escalation"], factual: true },
    { id: "rca", text: "You'll have the written root-cause analysis by Friday, October 9.", factKeys: ["requested_item"], factual: true },
    { id: "updates", text: "Engineering will send daily updates at 9am ET until it's fixed.", factKeys: ["next_step"], factual: true },
    { id: "expansion", text: "Once things settle, I'd love to pick up the conversation about the {expansion_interest}.", factual: true },
    { id: "bye", text: "Best, Maya", factual: false },
  ],
};
