import { formatValue } from "@/lib/engine/templates";
import type { GenerateInput } from "./types";

// Facts as a table the model can cite by id. Unknown values are listed as unknown
// so the model is told, not left to guess (rule 5).
export function factTable(input: GenerateInput): string {
  const rows = input.facts.map((f) => `${f.id} | ${f.key} | ${f.value === null ? "UNKNOWN" : formatValue(f.value)} | ${f.source} | ${f.observedAt.slice(0, 10)}`);
  return ["id | key | value | source | observed", ...rows].join("\n");
}

export function callBlock(input: GenerateInput): string {
  if (input.transcript.length === 0) return "(no transcript)";
  return input.transcript.map((l) => `[${l.ts}] ${l.speaker}: ${l.text}`).join("\n");
}

export function situation(input: GenerateInput): string {
  const lines = [
    `Account: ${input.accountName}`,
    `Recipient: ${input.recipient.name}, ${input.recipient.title}`,
    `Call date: ${input.callDate ?? "unknown"}`,
  ];
  if (input.openEscalation) lines.push("There is an OPEN support escalation: do not mention pricing, expansion, upsell or renewal terms.");
  if (input.avoid.length > 0) lines.push(`Do not include anything like these sentences, which were held for review:\n${input.avoid.map((s) => `- ${s}`).join("\n")}`);
  return lines.join("\n");
}

export const SENDER = "Maya";
