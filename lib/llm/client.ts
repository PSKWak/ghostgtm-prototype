// LLM_MODE=fixture (the default) makes every page and test work with no API key (rule 9).
export type LlmMode = "fixture" | "live";

export const llmMode = (): LlmMode => (process.env.LLM_MODE === "live" ? "live" : "fixture");
