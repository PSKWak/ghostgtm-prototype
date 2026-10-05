import { describe, expect, it } from "vitest";
import { rankFacts } from "@/lib/engine/standing";
import type { Fact, FactSource } from "@/lib/engine/types";

const fact = (id: string, key: string, value: string | null, source: FactSource, observedAt: string, accountId = "a1"): Fact => ({
  id, accountId, key, value, source, sourceRef: `ref:${id}`, observedAt, supersededBy: null, supersededReason: null,
});

describe("rankFacts", () => {
  it("ranks human_approved above crm_explicit even when older", () => {
    const r = rankFacts([
      fact("crm", "renewal_date", "2027-03-31", "crm_explicit", "2026-09-01T00:00:00Z"),
      fact("human", "renewal_date", "2026-12-31", "human_approved", "2026-01-01T00:00:00Z"),
    ]);
    expect(r.current.map((f) => f.id)).toEqual(["human"]);
  });

  it("keeps the CRM value over a newer AI inference, and reports the challenge", () => {
    const r = rankFacts([
      fact("crm", "renewal_date", "2027-03-31", "crm_explicit", "2025-03-14T00:00:00Z"),
      fact("call", "renewal_date", "2026-12-31", "ai_inferred", "2026-10-01T00:00:00Z"),
    ]);
    expect(r.current.map((f) => f.id)).toEqual(["crm"]);
    const loser = r.facts.find((f) => f.id === "call");
    expect(loser?.supersededBy).toBe("crm");
    expect(loser?.supersededReason).toBe("crm_explicit outranks ai_inferred");
    expect(r.challenged).toEqual([{ factId: "crm", byFactIds: ["call"] }]);
  });

  it("breaks same-tier ties by recency and flags disagreement inside the window as contested", () => {
    const r = rankFacts([
      fact("old", "final_approver", "Petra Novak", "ai_inferred", "2026-09-23T00:00:00Z"),
      fact("new", "final_approver", "Tomas Hruby", "ai_inferred", "2026-09-30T00:00:00Z"),
    ]);
    expect(r.current.map((f) => f.id)).toEqual(["new"]);
    expect(r.facts.find((f) => f.id === "old")?.supersededReason).toBe("newer ai_inferred value (2026-09-30)");
    expect(r.contested).toEqual([{ accountId: "a1", key: "final_approver", factIds: ["new", "old"] }]);
  });

  it("does not flag same-tier disagreement outside the conflict window", () => {
    const r = rankFacts([
      fact("old", "final_approver", "Petra Novak", "ai_inferred", "2026-01-01T00:00:00Z"),
      fact("new", "final_approver", "Tomas Hruby", "ai_inferred", "2026-09-30T00:00:00Z"),
    ]);
    expect(r.contested).toEqual([]);
  });

  it("does not flag agreeing values as contested or challenged", () => {
    const r = rankFacts([
      fact("a", "seat_count", "140", "crm_explicit", "2026-09-01T00:00:00Z"),
      fact("b", "seat_count", "140", "crm_explicit", "2026-09-10T00:00:00Z"),
      fact("c", "seat_count", "140", "web", "2026-09-20T00:00:00Z"),
    ]);
    expect(r.contested).toEqual([]);
    expect(r.challenged).toEqual([]);
  });

  it("keeps every loser and ranks keys and accounts independently", () => {
    const input = [
      fact("w1", "employee_count", "1,200", "web", "2026-08-20T00:00:00Z"),
      fact("c1", "employee_count", "450", "ai_inferred", "2026-09-30T00:00:00Z"),
      fact("x", "employee_count", "90", "web", "2026-08-20T00:00:00Z", "a2"),
      fact("s", "seat_count", "10", "crm_explicit", "2026-08-20T00:00:00Z"),
    ];
    const r = rankFacts(input);
    expect(r.facts).toHaveLength(4);
    expect(r.current.map((f) => f.id).sort()).toEqual(["c1", "s", "x"]);
    expect(r.facts.find((f) => f.id === "w1")?.supersededBy).toBe("c1");
  });

  it("is deterministic for identical tier and timestamp (id order)", () => {
    const r = rankFacts([
      fact("b", "k", "2", "web", "2026-08-20T00:00:00Z"),
      fact("a", "k", "1", "web", "2026-08-20T00:00:00Z"),
    ]);
    expect(r.current[0]?.id).toBe("a");
  });
});
