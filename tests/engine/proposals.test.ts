import { describe, expect, it } from "vitest";
import { applyCorrection, proposeCorrections } from "@/lib/engine/proposals";
import type { ClassifiedEdit } from "@/lib/engine/diff";
import type { Fact, FactSource } from "@/lib/engine/types";

const fact = (id: string, key: string, value: string, source: FactSource = "crm_explicit", observedAt = "2025-03-14T00:00:00Z"): Fact => ({
  id, accountId: "acct", key, value, source, sourceRef: "x", observedAt, supersededBy: null, supersededReason: null,
});
const edit = (factId: string | null, before: string, after: string): ClassifiedEdit => ({
  claimId: "c", before, after, category: "fact_correction", severity: "critical", method: "rule", factId, reason: "",
});

const crm = fact("f_crm", "renewal_date", "2027-03-31");
const call = fact("f_call", "renewal_date", "2026-12-31", "ai_inferred", "2026-10-01T00:00:00Z");
const approver = fact("f_ap", "final_approver", "Petra Novak", "ai_inferred");

describe("proposeCorrections", () => {
  const propose = (e: ClassifiedEdit, f: Fact) => proposeCorrections([e], [f]);

  it("turns a corrected full date into an ISO proposal for the cited fact's key", () => {
    expect(propose(edit("f_crm", "for March 31, 2027.", "for December 31, 2026."), crm)).toEqual({
      proposals: [{ factKey: "renewal_date", currentFactId: "f_crm", proposedValue: "2026-12-31", claimId: "c" }], unresolved: [],
    });
  });

  it("accepts day-first and unambiguous numeric dates", () => {
    expect(propose(edit("f_crm", "March 31, 2027", "31 December 2026"), crm).proposals[0]?.proposedValue).toBe("2026-12-31");
    expect(propose(edit("f_crm", "March 31, 2027", "12/31/2026"), crm).proposals[0]?.proposedValue).toBe("2026-12-31");
  });

  it("replaces only the value inside a longer fact, keeping the rest of its text", () => {
    const next = fact("f_next", "next_step", "Security review call, week of 2026-10-12", "ai_inferred");
    expect(propose(edit("f_next", "October 12, 2026", "October 19, 2026"), next).proposals[0]?.proposedValue).toBe("Security review call, week of 2026-10-19");
    const seats = fact("f_seats", "seat_count", "140 seats");
    expect(propose(edit("f_seats", "140", "150"), seats).proposals[0]?.proposedValue).toBe("150 seats");
  });

  it("explains instead of guessing: missing year, impossible date, ambiguous date", () => {
    expect(propose(edit("f_crm", "March 31, 2027.", "December 31."), crm).unresolved[0]?.reason).toBe("write the full renewal date, including day and year");
    expect(propose(edit("f_crm", "March 31, 2027.", "February 30, 2026."), crm).unresolved[0]?.reason).toBe(`"February 30, 2026" isn't a real date`);
    expect(propose(edit("f_crm", "March 31, 2027.", "03/04/2026."), crm).unresolved[0]?.reason).toContain("could mean two different dates");
  });

  it("extracts just the new name from a rewritten sentence", () => {
    expect(propose(edit("f_ap", "Petra Novak", "Tomas Hruby,"), approver).proposals[0]?.proposedValue).toBe("Tomas Hruby");
    expect(propose(edit("f_ap", "address it to Petra Novak, since", "send it to Tomas Hruby, who signs off on budget"), approver).proposals[0]?.proposedValue).toBe("Tomas Hruby");
  });

  it("refuses a rewrite that names nobody or several people", () => {
    expect(propose(edit("f_ap", "Petra Novak", "the CFO"), approver).unresolved).toHaveLength(1);
    expect(propose(edit("f_ap", "Petra Novak", "Tomas Hruby and Jana Svoboda"), approver).unresolved).toHaveLength(1);
  });

  it("ignores edits with no cited fact, and dedupes per key", () => {
    expect(proposeCorrections([edit(null, "18%", "12%")], [crm])).toEqual({ proposals: [], unresolved: [] });
    const twice = [edit("f_crm", "March 31, 2027", "December 31, 2026"), edit("f_crm", "March 31, 2027", "December 31, 2026")];
    expect(proposeCorrections(twice, [crm]).proposals).toHaveLength(1);
  });
});

describe("applyCorrection", () => {
  const proposal = { factKey: "renewal_date", currentFactId: "f_crm", proposedValue: "2026-12-31", claimId: "c" };
  const confirm = { userId: "u_maya", decisionId: "dec_1", now: "2026-10-04T12:00:00Z" };

  it("refuses without a confirming human (rule 7)", () => {
    expect(applyCorrection([crm, call], proposal, { ...confirm, userId: "" })).toEqual({ ok: false, reason: "a human must confirm a correction" });
  });

  it("adds a human_approved fact that wins, and keeps the old values with reasons (rule 6)", () => {
    const r = applyCorrection([crm, call], proposal, confirm);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.newFact).toMatchObject({ source: "human_approved", value: "2026-12-31", sourceRef: "decision:dec_1" });
    expect(r.value.standing.current.map((f) => f.id)).toEqual([r.value.newFact.id]);
    expect(r.value.standing.facts.find((f) => f.id === "f_crm")?.supersededReason).toBe("human_approved outranks crm_explicit");
    expect(r.value.standing.challenged).toEqual([]);
  });
});
