import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { GENERATE_EFFORT, GENERATE_MAX_OUTPUT_TOKENS, GENERATE_MODEL, GROQ_MODEL, GROQ_REASONING_EFFORT } from "@/lib/config";
import { llmProvider } from "./provider";

// The only place that talks to a model. Server-only: keys never reach the browser (rule 8).
export type ModelCall = (req: { system: string; prompt: string; schema: z.ZodType }) =>
  Promise<{ output: unknown; finishReason: string; model: string }>;

type Target = { model: LanguageModel; providerOptions: Parameters<typeof generateText>[0]["providerOptions"] };

export function modelTarget(): Target {
  if (llmProvider() === "groq") {
    return {
      model: groq(GROQ_MODEL),
      // Strict mode rejects common Zod constraints (min/max lengths); the output is Zod-parsed anyway.
      providerOptions: { groq: { structuredOutputs: true, strictJsonSchema: false, reasoningEffort: GROQ_REASONING_EFFORT } },
    };
  }
  return {
    model: anthropic(GENERATE_MODEL),
    // On a safety decline, the API re-runs the request on a fallback model it picks.
    providerOptions: { anthropic: { effort: GENERATE_EFFORT, structuredOutputMode: "outputFormat", fallbacks: "default" } },
  };
}

export const callLiveModel: ModelCall = async ({ system, prompt, schema }) => {
  const { model, providerOptions } = modelTarget();
  const result = await generateText({
    model, system, prompt, providerOptions,
    output: Output.object({ schema }),
    maxOutputTokens: GENERATE_MAX_OUTPUT_TOKENS,
  });
  return { output: result.output, finishReason: result.finishReason, model: result.response.modelId };
};
