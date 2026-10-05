import { GENERATE_MODEL, GROQ_MODEL } from "@/lib/config";

// Which hosted model family live mode calls. Anything other than "groq" means Claude.
export type LlmProvider = "anthropic" | "groq";

export const llmProvider = (): LlmProvider => (process.env.LLM_PROVIDER === "groq" ? "groq" : "anthropic");

export const activeModelId = (): string => (llmProvider() === "groq" ? GROQ_MODEL : GENERATE_MODEL);
