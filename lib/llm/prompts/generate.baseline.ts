import { z } from "zod";
import { splitSentences } from "@/lib/engine/commercial";
import type { Claim, Draft } from "@/lib/engine/types";
import { callBlock, factTable, SENDER, situation } from "./shared";
import type { GeneratePrompt } from "./types";

// generate@baseline: the pre-registered comparison arm (experiments/grounding.md).
// Same facts and transcript, but the model writes free prose and lists its sources
// once for the whole email (document-level citation). It is not verified or retried.

export const GenerationBaseline = z.object({
  insight: z.string().min(1),
  subject: z.string().min(1).max(120),
  body: z.string().min(1).describe("The full email, greeting to sign-off."),
  sources: z.array(z.string()).describe("Ids from the fact table the email relies on."),
});

const SYSTEM = `You write post-call follow-up emails for a B2B sales rep named ${SENDER}.
Use the fact table and the call transcript. Keep it under 150 words, warm and specific.
Start with "Hi <first name>," and end with "Best, ${SENDER}". List the ids of the facts you used as sources.
The insight is one sentence for the rep only and is not part of the email.`;

const build = (input: Parameters<GeneratePrompt["build"]>[0]) =>
  [situation(input), "", "Facts:", factTable(input), "", "Call transcript:", callBlock(input)].join("\n");

// Every factual sentence carries the whole source list: that is what a
// document-level citation claims.
function toDraft(out: z.infer<typeof GenerationBaseline>): { draft: Draft; insight: string } {
  const lines = out.body.split(/\n+/).flatMap(splitSentences);
  const claims: Claim[] = lines.map((sentence, i) => {
    const greeting = i === 0 && sentence.endsWith(",");
    const signoff = i === lines.length - 1 && /^(best|thanks|cheers|regards)\b/i.test(sentence);
    const factual = !greeting && !signoff;
    return { id: `s${i + 1}`, sentence, factIds: factual ? out.sources : [], factual };
  });
  return { insight: out.insight, draft: { subject: out.subject, claims } };
}

export const generateBaseline: GeneratePrompt<typeof GenerationBaseline> = {
  id: "generate@baseline", verifies: false, system: SYSTEM, schema: GenerationBaseline, build, toDraft,
};
