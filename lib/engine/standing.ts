import { CONFLICT_WINDOW_DAYS } from "@/lib/config";
import { FACT_SOURCES, type Fact } from "./types";

// Rule 6: human_approved > crm_explicit > ai_inferred > web, then recency.
const tierOf = (f: Fact) => FACT_SOURCES.indexOf(f.source);

export type Standing = {
  facts: Fact[]; // every input fact, losers carrying supersededBy + reason
  current: Fact[]; // one winner per (account, key)
  contested: { accountId: string; key: string; factIds: string[] }[];
  challenged: { factId: string; byFactIds: string[] }[]; // newer lower-tier values disagree
};

function compareStanding(a: Fact, b: Fact): number {
  return (
    tierOf(a) - tierOf(b) ||
    Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
    a.id.localeCompare(b.id)
  );
}

function supersedeReason(winner: Fact, loser: Fact): string {
  if (winner.source !== loser.source) return `${winner.source} outranks ${loser.source}`;
  return `newer ${winner.source} value (${winner.observedAt.slice(0, 10)})`;
}

const daysApart = (a: Fact, b: Fact) =>
  Math.abs(Date.parse(a.observedAt) - Date.parse(b.observedAt)) / 86_400_000;

function groupByKey(facts: Fact[]): Map<string, Fact[]> {
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    const k = `${f.accountId}\u0000${f.key}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return groups;
}

export function rankFacts(input: Fact[]): Standing {
  const result: Standing = { facts: [], current: [], contested: [], challenged: [] };
  for (const group of groupByKey(input).values()) {
    const [winner, ...losers] = [...group].sort(compareStanding);
    if (!winner) continue;
    const current = { ...winner, supersededBy: null, supersededReason: null };
    result.current.push(current);
    result.facts.push(current);
    for (const l of losers) {
      result.facts.push({ ...l, supersededBy: winner.id, supersededReason: supersedeReason(winner, l) });
    }

    // A human decision settles the key; nothing can contest or challenge it.
    if (winner.source === "human_approved") continue;
    const disagree = losers.filter((l) => l.value !== winner.value);
    const rivals = disagree.filter(
      (l) => l.source === winner.source && daysApart(l, winner) <= CONFLICT_WINDOW_DAYS,
    );
    if (rivals.length > 0) {
      result.contested.push({ accountId: winner.accountId, key: winner.key, factIds: [winner.id, ...rivals.map((r) => r.id)] });
    }
    const newer = disagree.filter((l) => l.source !== winner.source && l.observedAt > winner.observedAt);
    if (newer.length > 0) result.challenged.push({ factId: winner.id, byFactIds: newer.map((n) => n.id) });
  }
  return result;
}
