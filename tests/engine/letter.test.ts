import { describe, expect, it } from "vitest";
import { renderLetter, splitLetter } from "@/lib/engine/letter";
import { factLabel, formatWhen } from "@/lib/format";
import type { Claim } from "@/lib/engine/types";

const c = (id: string, sentence: string, factual = false): Claim => ({ id, sentence, factIds: [], factual });
const claims = [c("hi", "Hi Dana,"), c("t", "Thanks for the time."), c("s", "All 140 seats are live.", true), c("bye", "Best, Maya")];

describe("letter layout", () => {
  it("puts the greeting and sign-off on their own lines", () => {
    expect(splitLetter(claims).body.map((x) => x.id)).toEqual(["t", "s"]);
    expect(renderLetter({ subject: "s", claims })).toBe("Hi Dana,\n\nThanks for the time. All 140 seats are live.\n\nBest, Maya");
  });
  it("leaves a draft without a greeting alone", () => {
    expect(splitLetter([c("s", "All 140 seats are live.", true)])).toEqual({ greeting: [], body: [claims[2]!].map((x) => ({ ...x, id: "s" })), signoff: [] });
  });
});

describe("display helpers", () => {
  it("uses sentence case and keeps acronyms", () => {
    expect(factLabel("renewal_date")).toBe("Renewal date");
    expect(factLabel("arr")).toBe("ARR");
  });
  it("formats time identically everywhere", () => {
    expect(formatWhen("2026-10-04T22:56:08Z")).toBe("Oct 4, 2026, 10:56 PM UTC");
  });
});
