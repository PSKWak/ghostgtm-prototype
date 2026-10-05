import { describe, expect, it } from "vitest";
import { findCommercialSentences, isCommercial } from "@/lib/engine/commercial";

describe("isCommercial", () => {
  for (const pitch of [
    "Happy to share pricing for the 3 new sites.",
    "We can offer a discount if you renew early.",
    "When you're ready, let's talk expansion.",
    "Once this is fixed, let's talk about rolling Ghost out to your other clinics.",
    "Happy to walk you through our Q4 offer when you're ready.",
    "We could also grow your footprint next quarter.",
    "Once things settle, I'd love to pick up the conversation about the 3 additional clinic sites.",
    "We'd also love to discuss a bigger license tier.",
  ]) it(`flags: ${pitch}`, () => expect(isCommercial(pitch)).toBe(true));

  for (const fine of [
    "The sync now covers the new seats your front desk added.",
    "You'll have the written root-cause analysis by Friday, October 9.",
    "Engineering will send daily updates at 9am ET until it's fixed.",
    "Let's get your other clinics' appointments back in sync first.",
    "Your premium support plan covers the weekend on-call.",
  ]) it(`allows: ${fine}`, () => expect(isCommercial(fine)).toBe(false));
});

describe("findCommercialSentences", () => {
  it("returns only the offending sentences", () => {
    expect(findCommercialSentences("RCA by Friday. Also, our special offer ends soon! Updates daily.")).toEqual(["Also, our special offer ends soon!"]);
  });
});
