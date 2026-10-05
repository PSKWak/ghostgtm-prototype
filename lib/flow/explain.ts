import { formatValue } from "@/lib/engine/templates";
import type { Fact, RiskVerdict } from "@/lib/engine/types";

// Turns a risk rule into one sentence a rep can act on. Facts are looked up by
// the ids in the stored reason, so an old explanation stays true after the graph changes.

export type RiskExplanation = { tone: "ok" | "review" | "held"; headline: string; detail: string };

const label = (key: string) => key.replace(/_/g, " ");
const show = (f: Fact) => formatValue(f.value ?? "unknown");
const when = (f: Fact) => f.observedAt.slice(0, 10);
const SOURCE: Record<Fact["source"], string> = {
  human_approved: "a rep", crm_explicit: "the CRM", ai_inferred: "a call", web: "the web",
};
const SOURCES: Record<Fact["source"], string> = {
  human_approved: "reps", crm_explicit: "CRM records", ai_inferred: "calls", web: "web sources",
};

function factIn(reason: string, facts: Fact[]): Fact | undefined {
  const id = reason.match(/\bf_\w+/)?.[0];
  return facts.find((f) => f.id === id);
}

function challengedDetail(reason: string, facts: Fact[]): string {
  const f = factIn(reason, facts);
  if (!f) return reason;
  const newer = facts.find((o) => o.key === f.key && o.value !== f.value && o.observedAt > f.observedAt && o.source !== f.source);
  const against = newer ? `, but ${SOURCE[newer.source]} on ${when(newer)} said ${show(newer)}` : "";
  return `The ${label(f.key)} on file is ${show(f)} (from ${SOURCE[f.source]}, ${when(f)})${against}. Check it before this goes out.`;
}

function contestedDetail(reason: string, facts: Fact[]): string {
  const f = factIn(reason, facts);
  if (!f) return reason;
  const rival = facts.find((o) => o.key === f.key && o.value !== f.value && o.source === f.source);
  return `Two ${SOURCES[f.source]} disagree on the ${label(f.key)}: ${show(f)}${rival ? ` vs ${show(rival)}` : ""}. Ghost used the newer one; confirm it's right.`;
}

export function explainRisk(r: { verdict: RiskVerdict; rule: string; reason: string }, facts: Fact[]): RiskExplanation {
  const review = (detail: string): RiskExplanation => ({ tone: "review", headline: "Needs your OK", detail });
  const held = (detail: string): RiskExplanation => ({ tone: "held", headline: "Held by Ghost", detail });
  switch (r.rule) {
    case "challenged_fact": return review(challengedDetail(r.reason, facts));
    case "contested_fact": return review(contestedDetail(r.reason, facts));
    case "executive_recipient": return review("The recipient is an executive, so a person signs off on every message.");
    case "partial_support": return review("One sentence is only partly backed by the record.");
    case "trust_below_email_autorun":
    case "trust_below_autorun": return review("Ghost doesn't act on its own yet; your approvals build that trust.");
    case "commercial_during_escalation": {
      const esc = facts.find((f) => f.key === "support_escalation" && f.supersededBy === null);
      return held(`There's an open support escalation${esc ? ` (${show(esc)})` : ""}. Commercial asks are paused until it's resolved, so this draft can't be sent.`);
    }
    case "unsupported_claim": return held("A sentence isn't backed by any fact on record, so this can't be sent.");
    case "stale_fact": return held("A sentence relies on a value that has since been replaced.");
    case "wrong_recipient": return held("The recipient isn't at the account's domain.");
    default: return r.verdict === "allow"
      ? { tone: "ok", headline: "Cleared", detail: "Approved by a rep and no safety rule fired." }
      : { tone: r.verdict === "block" ? "held" : "review", headline: r.verdict === "block" ? "Held by Ghost" : "Needs your OK", detail: r.reason };
  }
}
