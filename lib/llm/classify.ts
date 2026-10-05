import { GENERATE_MODEL } from "@/lib/config";
import type { EditSpan } from "@/lib/engine/diff";
import { classifyLeftover } from "@/lib/engine/edit-rules";
import type { ClassifyMethod, EditCategory, Severity } from "@/lib/engine/types";
import type { ModelCall } from "./model";
import { buildClassifyPrompt, CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM, ClassifyOutput } from "./prompts/classify.v1";

export type EditLabel = { category: EditCategory; severity: Severity; method: ClassifyMethod; reason: string };
export type ClassifyRun = { promptVersion: string; model: string; parseOk: boolean; output: unknown; error?: string; latencyMs: number };

// One call for all of an approval's leftover edits. Any edit the model doesn't label,
// or any failure, falls back to the rules, and the label says which method decided it.
export async function classifyLeftovers(spans: EditSpan[], deps: { mode: "fixture" | "live"; callModel: ModelCall }): Promise<{ labels: EditLabel[]; run: ClassifyRun | null }> {
  const byRule = spans.map(classifyLeftover);
  if (spans.length === 0 || deps.mode === "fixture") return { labels: byRule, run: null };
  const started = Date.now();
  try {
    const res = await deps.callModel({ system: CLASSIFY_SYSTEM, prompt: buildClassifyPrompt(spans), schema: ClassifyOutput });
    const parsed = ClassifyOutput.safeParse(res.output);
    const run: ClassifyRun = { promptVersion: CLASSIFY_PROMPT_VERSION, model: res.model, parseOk: parsed.success, output: res.output, latencyMs: Date.now() - started };
    if (!parsed.success) return { labels: byRule, run: { ...run, error: parsed.error.issues[0]?.message } };
    const labels = spans.map((_, i): EditLabel => {
      const l = parsed.data.labels.find((x) => x.index === i);
      return l ? { category: l.category, severity: l.severity, method: "llm", reason: l.reason } : byRule[i]!;
    });
    return { labels, run };
  } catch (e) {
    return { labels: byRule, run: { promptVersion: CLASSIFY_PROMPT_VERSION, model: GENERATE_MODEL, parseOk: false, output: null, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started } };
  }
}
