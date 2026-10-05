import { afterEach, describe, expect, it, vi } from "vitest";
import { modelTarget } from "@/lib/llm/model";
import { activeModelId, llmProvider } from "@/lib/llm/provider";

afterEach(() => vi.unstubAllEnvs());
const modelIdOf = (m: unknown) => (m as { modelId: string }).modelId;

describe("live model provider", () => {
  it("defaults to Claude", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    expect(llmProvider()).toBe("anthropic");
    expect(activeModelId()).toBe("claude-opus-5-5");
    const t = modelTarget();
    expect(modelIdOf(t.model)).toBe("claude-opus-5-5");
    expect(t.providerOptions).toMatchObject({ anthropic: { effort: "medium", fallbacks: "default" } });
  });

  it("switches to Groq with JSON-schema structured outputs", () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    expect(activeModelId()).toBe("openai/gpt-oss-120b");
    const t = modelTarget();
    expect(modelIdOf(t.model)).toBe("openai/gpt-oss-120b");
    expect(t.providerOptions).toEqual({ groq: { structuredOutputs: true, strictJsonSchema: false, reasoningEffort: "medium" } });
  });

  it("treats an unknown provider name as Claude rather than guessing", () => {
    vi.stubEnv("LLM_PROVIDER", "gorq");
    expect(llmProvider()).toBe("anthropic");
  });
});
