import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { GENERATE_EFFORT, GENERATE_MAX_OUTPUT_TOKENS, GENERATE_MODEL } from "@/lib/config";

// The only place that talks to Claude. Server-only: the key never reaches the browser (rule 8).
export type ModelCall = (req: { system: string; prompt: string; schema: z.ZodType }) =>
  Promise<{ output: unknown; finishReason: string; model: string }>;

export const callClaude: ModelCall = async ({ system, prompt, schema }) => {
  const result = await generateText({
    model: anthropic(GENERATE_MODEL),
    system,
    prompt,
    output: Output.object({ schema }),
    maxOutputTokens: GENERATE_MAX_OUTPUT_TOKENS,
    providerOptions: {
      anthropic: {
        effort: GENERATE_EFFORT,
        structuredOutputMode: "outputFormat",
        // On a safety decline, the API re-runs the request on a fallback model it picks.
        fallbacks: "default",
      },
    },
  });
  return { output: result.output, finishReason: result.finishReason, model: result.response.modelId };
};
