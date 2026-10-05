import { z } from "zod";
import type { Draft } from "@/lib/engine/types";
import { callBlock, factTable, SENDER, situation } from "./shared";
import type { GeneratePrompt } from "./types";

// generate@v1: claim-level evidence. Every sentence is its own item and names the
// fact ids it relies on, so verify.ts can check each claim (rule 5).

export const GenerationV1 = z.object({
  insight: z.string().min(1).describe("One sentence for the rep: the most important thing this call changed."),
  subject: z.string().min(1).max(120),
  sentences: z.array(z.object({
    text: z.string().min(1),
    factIds: z.array(z.string()).describe("Ids from the fact table this sentence relies on. Empty only for greetings and sign-offs."),
    factual: z.boolean().describe("False only for the greeting, pleasantries and the sign-off."),
  })).min(3).max(12),
});

const SYSTEM = `You write post-call follow-up emails for a B2B sales rep named ${SENDER}.
Ground every factual statement in the fact table you are given, and cite the ids of the facts each sentence uses.
Rules:
- Only state values that appear in the fact table. If a value is UNKNOWN, say it is not decided or not confirmed yet; never invent one.
- Cite only ids that appear in the table. A sentence with a date, number, amount or name must cite the fact that contains it.
- Write a date exactly as it appears in the table.
- Keep it under 150 words, warm and specific. The first sentence is the greeting ("Hi <first name>,") and the last is "Best, ${SENDER}"; both are not factual.
- The insight is for the rep only and is not part of the email.`;

function build(input: Parameters<GeneratePrompt["build"]>[0], feedback: string[] = []): string {
  const parts = [situation(input), "", "Facts:", factTable(input), "", "Call transcript:", callBlock(input)];
  if (feedback.length > 0) {
    parts.push("", "Your previous draft failed these checks. Fix every one, citing only ids from the table:", ...feedback.map((f) => `- ${f}`));
  }
  return parts.join("\n");
}

function toDraft(out: z.infer<typeof GenerationV1>): { draft: Draft; insight: string } {
  return {
    insight: out.insight,
    draft: {
      subject: out.subject,
      claims: out.sentences.map((s, i) => ({ id: `s${i + 1}`, sentence: s.text.trim(), factIds: s.factIds, factual: s.factual })),
    },
  };
}

export const generateV1: GeneratePrompt<typeof GenerationV1> = {
  id: "generate@v1", verifies: true, system: SYSTEM, schema: GenerationV1, build, toDraft,
};
