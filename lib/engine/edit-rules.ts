import { isCommercial } from "./commercial";
import type { EditSpan } from "./diff";
import { extractValues } from "./tokens";
import type { EditCategory, Severity } from "./types";

// Rule-based classification for edits the fact diff left over. It is the fixture
// classifier and the fallback when the LLM classifier fails. Rules are general on
// purpose: they were not tuned on the feedback experiment's labeled cases.

export type LeftoverLabel = { category: EditCategory; severity: Severity; method: "rule"; reason: string };

// Kinds of next step a follow-up proposes; swapping one for another changes the plan.
const ACTIONS = ["call", "meeting", "demo", "review", "workshop", "trial", "pilot", "proposal", "quote", "pricing", "intro", "introduction", "summary", "report", "email"];

const label = (category: EditCategory, severity: Severity, reason: string): LeftoverLabel => ({ category, severity, method: "rule", reason });
const actionsIn = (text: string) => ACTIONS.filter((a) => new RegExp(`\\b${a}s?\\b`, "i").test(text));
const properNames = (text: string) => text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? [];

export function classifyLeftover(span: EditSpan): LeftoverLabel {
  const before = span.before.trim();
  const after = span.after.trim();
  if (isCommercial(before) && !isCommercial(after)) return label("risk_removal", "major", "removed a commercial ask");
  if (after === "") return label("style", "minor", "removed a sentence with no fact or ask in it");

  const newValues = extractValues(after).filter((v) => !before.includes(v.raw));
  const newNames = properNames(after).filter((n) => !before.includes(n));
  if (newValues.length > 0 || newNames.length > 0) {
    return label("missing_context", "major", `added ${[...newValues.map((v) => v.raw), ...newNames].join(", ")}`);
  }

  const was = actionsIn(before);
  const now = actionsIn(after);
  if (now.length > 0 && was.length > 0 && now.some((a) => !was.includes(a))) {
    return label("action_change", "major", `changed the next step from ${was.join("/")} to ${now.join("/")}`);
  }
  return label("style", "minor", "reworded without changing facts or the next step");
}
