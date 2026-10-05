import { describe, expect, it } from "vitest";
import { extractValues, isRealDate, valuesMatch } from "@/lib/engine/tokens";

describe("extractValues", () => {
  it("reads ISO and written dates into the same shape", () => {
    expect(extractValues("2026-12-31")).toEqual([{ kind: "date", y: 2026, m: 12, d: 31, raw: "2026-12-31" }]);
    expect(extractValues("renews December 31st, 2026.")).toEqual([{ kind: "date", y: 2026, m: 12, d: 31, raw: "December 31st, 2026" }]);
    expect(extractValues("in March 2027")).toEqual([{ kind: "date", y: 2027, m: 3, raw: "March 2027" }]);
  });

  it("reads money with k/m suffixes and plain numbers with percent", () => {
    expect(extractValues("ARR of $84,000")).toEqual([{ kind: "money", n: 84000, raw: "$84,000" }]);
    expect(extractValues("about $84k")).toEqual([{ kind: "money", n: 84000, raw: "$84k" }]);
    expect(extractValues("140 seats, 18% faster")).toEqual([
      { kind: "number", n: 140, raw: "140" },
      { kind: "number", n: 18, raw: "18%" },
    ]);
  });

  it("does not double count numbers inside dates or money", () => {
    expect(extractValues("By October 9th we send $5,000")).toHaveLength(2);
  });

  it("does not treat the modal verb 'may' as a month", () => {
    expect(extractValues("we may follow up")).toEqual([]);
  });
});

describe("valuesMatch", () => {
  it("matches dates on the parts both sides state", () => {
    const [iso] = extractValues("2027-03-31");
    const [month] = extractValues("March 2027");
    const [other] = extractValues("December 31, 2026");
    expect(valuesMatch(month!, iso!)).toBe(true);
    expect(valuesMatch(other!, iso!)).toBe(false);
  });
  it("matches money to money only", () => {
    const [m] = extractValues("$84,000");
    const [n] = extractValues("84000");
    expect(valuesMatch(m!, n!)).toBe(false);
  });
});

describe("date formats from around the world", () => {
  it("reads day-first written dates", () => {
    expect(extractValues("on 31 December 2026")).toEqual([{ kind: "date", y: 2026, m: 12, d: 31, raw: "31 December 2026" }]);
  });
  it("reads unambiguous numeric dates either way round", () => {
    expect(extractValues("12/31/2026")[0]).toMatchObject({ y: 2026, m: 12, d: 31 });
    expect(extractValues("31/12/2026")[0]).toMatchObject({ y: 2026, m: 12, d: 31 });
  });
  it("never guesses an ambiguous numeric date, and never matches it", () => {
    const [v] = extractValues("03/04/2026");
    expect(v).toMatchObject({ ambiguous: true });
    const [iso] = extractValues("2026-03-04");
    expect(valuesMatch(v!, iso!)).toBe(false);
  });
  it("knows which dates exist", () => {
    expect(isRealDate(extractValues("February 30, 2026")[0]!)).toBe(false);
    expect(isRealDate(extractValues("February 28, 2026")[0]!)).toBe(true);
    expect(isRealDate(extractValues("March 2027")[0]!)).toBe(false);
  });
});
