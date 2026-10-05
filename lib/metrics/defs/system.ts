import { DEFAULT_MIN_SAMPLE } from "@/lib/config";
import { DEFAULT_PROMPT_VERSION } from "@/lib/llm/prompts";
import { breakdownOf, groupBy, rateResult } from "../result";
import type { MetricDef, ReplayRow } from "../types";

// Each test's most recent result for each prompt version.
function latestReplays(replays: ReplayRow[]): ReplayRow[] {
  const latest = new Map<string, ReplayRow>();
  for (const r of [...replays].sort((a, b) => a.ranAt.localeCompare(b.ranAt))) latest.set(`${r.testCaseId}|${r.promptVersion}`, r);
  return [...latest.values()];
}
const asRows = (rs: ReplayRow[]) => rs.map((r) => ({ ...r, isSynthetic: false }));

export const systemMetrics: MetricDef[] = [
  {
    id: "write_fidelity", label: "Write fidelity", kind: "rate", source: "system", minSample: DEFAULT_MIN_SAMPLE,
    question: "Did every executed write match exactly what the rep approved?",
    numerator: "executions whose content hash matched the approved version",
    denominator: "all executions",
    compute: (r) => rateResult(r.executions, (e) => e.hashMatches, DEFAULT_MIN_SAMPLE),
  },
  {
    id: "grounding_pass_rate", label: "Grounding pass rate", kind: "rate", source: "system", minSample: DEFAULT_MIN_SAMPLE,
    question: "How often does a live draft pass per-claim verification on the first try?",
    numerator: "live generate runs whose first attempt passed verify",
    denominator: "live generate runs (first attempts; template and cached drafts excluded)",
    compute: (r) => rateResult(r.generateRuns.filter((g) => g.mode === "live"), (g) => g.verifyPassedFirstTry === true, DEFAULT_MIN_SAMPLE),
  },
  {
    id: "replay_pass_rate", label: "Replay pass rate", kind: "rate", source: "system", minSample: 1,
    question: "Do the latest drafts still get right what reps corrected before?",
    numerator: `regression tests passing on their latest replay with ${DEFAULT_PROMPT_VERSION}`,
    denominator: `regression tests replayed with ${DEFAULT_PROMPT_VERSION}`,
    compute: (r) => {
      const latest = latestReplays(r.replays);
      const breakdown = breakdownOf(groupBy(asRows(latest), (x) => x.promptVersion), (x) => x.passed, 1);
      return { ...rateResult(asRows(latest.filter((x) => x.promptVersion === DEFAULT_PROMPT_VERSION)), (x) => x.passed, 1), breakdown };
    },
  },
];
