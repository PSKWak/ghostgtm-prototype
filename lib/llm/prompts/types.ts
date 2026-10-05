import type { z } from "zod";
import type { TranscriptLine } from "@/lib/db/schema";
import type { Draft, Fact } from "@/lib/engine/types";

// What every generate prompt receives. Only current facts go in: the model never
// sees superseded values, so it can't repeat them.
export type GenerateInput = {
  accountName: string;
  recipient: { name: string; title: string };
  callDate: string | null;
  transcript: TranscriptLine[];
  facts: Fact[];
  openEscalation: boolean;
  avoid: string[]; // sentences a redraft must not repeat (the ones the shield held)
};

export type PromptVersionId = "generate@v1" | "generate@baseline";

export type GeneratePrompt<S extends z.ZodType = z.ZodType> = {
  id: PromptVersionId;
  // Only the claim-level prompt is verified and retried; the baseline is the
  // pre-registered comparison arm and runs as-is.
  verifies: boolean;
  system: string;
  schema: S;
  build: (input: GenerateInput, feedback?: string[]) => string;
  toDraft: (output: z.infer<S>) => { draft: Draft; insight: string };
};
