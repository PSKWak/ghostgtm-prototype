import { generateBaseline } from "./generate.baseline";
import { generateV1 } from "./generate.v1";
import type { GeneratePrompt, PromptVersionId } from "./types";

export const PROMPT_VERSIONS: Record<PromptVersionId, GeneratePrompt> = {
  "generate@v1": generateV1 as GeneratePrompt,
  "generate@baseline": generateBaseline as GeneratePrompt,
};

export const DEFAULT_PROMPT_VERSION: PromptVersionId = "generate@v1";

export const isPromptVersion = (v: string): v is PromptVersionId => v in PROMPT_VERSIONS;

export type { GenerateInput, GeneratePrompt, PromptVersionId } from "./types";
