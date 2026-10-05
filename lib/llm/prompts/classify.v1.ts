import { z } from "zod";
import type { EditSpan } from "@/lib/engine/diff";

// classify_edit@v1: labels the rep's non-fact edits so each one routes to the
// right fix (prompt, graph or policy). Facts are classified by rules before this runs.

export const CLASSIFY_PROMPT_VERSION = "classify_edit@v1";

export const ClassifyOutput = z.object({
  labels: z.array(z.object({
    index: z.number().int().nonnegative(),
    category: z.enum(["missing_context", "style", "action_change", "risk_removal"]),
    severity: z.enum(["critical", "major", "minor"]),
    reason: z.string().min(1).max(200),
  })),
});

export const CLASSIFY_SYSTEM = `You label edits a sales rep made to an AI-drafted follow-up email before sending it.
For each numbered edit choose exactly one category:
- missing_context: the rep added a fact, person, date, number or request the draft left out.
- style: wording, tone or length changed; the meaning and the next step did not.
- action_change: the rep changed what happens next (a different meeting, deliverable or ask).
- risk_removal: the rep removed something unsafe to send (a sales ask at the wrong time, a promise, sensitive detail).
Severity: major if sending the original would have misled or annoyed the customer, minor for polish. Use critical only for something that would have caused real harm.
Give a short reason. Return one label per edit, by index.`;

export const buildClassifyPrompt = (spans: EditSpan[]) =>
  spans.map((s, i) => `Edit ${i}:\n  before: ${s.before || "(nothing)"}\n  after: ${s.after || "(removed)"}`).join("\n\n");
