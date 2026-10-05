import { z } from "zod";
import { AuditResult, AutonomyResult, FeedbackResult, GroundingResult } from "@/lib/metrics/defs/experiments";
import type { ExperimentRow } from "@/lib/metrics/types";

// Turns a stored experiment result into one sentence a person can check against a label
// file. The Show rows page used to print the raw JSON, cut off, which hid the very thing
// the number was counting.

const AuditDetail = AuditResult.extend({ claims: z.array(z.object({ expected: z.string(), actual: z.string(), sentence: z.string().optional(), reason: z.string().optional() })) });
const AutonomyDetail = AutonomyResult.extend({ rule: z.string().optional(), reason: z.string().optional(), confidence: z.number().optional() });
const GroundingDetail = z.union([
  GroundingResult.extend({ attempts: z.number().optional(), model: z.string().nullable().optional() }),
  z.object({ failed: z.literal(true), error: z.string() }),
]);

const words = (s: string | null | undefined) => (s ?? "none").replace(/_/g, " ");
const mark = (ok: boolean) => (ok ? "✓" : "✗");

export function describeExperimentRow(row: Pick<ExperimentRow, "experiment" | "arm" | "caseId" | "result">, claimIndex?: number): string {
  const head = `${words(row.experiment)} · ${words(row.arm)} · case ${row.caseId}`;
  if (row.experiment === "grounding_audit") {
    const p = AuditDetail.safeParse(row.result);
    const c = p.success && claimIndex !== undefined ? p.data.claims[claimIndex] : undefined;
    return c ? `"${c.sentence ?? "(sentence not stored)"}" · human label: ${c.expected} · verify.ts: ${c.actual} ${mark(c.actual === c.expected)}${c.reason ? ` · why: ${c.reason}` : ""}` : head;
  }
  if (row.experiment === "feedback") {
    const p = FeedbackResult.safeParse(row.result);
    if (!p.success) return head;
    const r = p.data;
    const parts = [`${head}`, `routed to ${r.actualRoute} (expected ${r.expectedRoute}) ${mark(r.actualRoute === r.expectedRoute)}`];
    if (r.expectedCategory) parts.push(`edit labeled ${words(r.actualCategory)} by ${r.method ?? "no method"} (expected ${words(r.expectedCategory)}) ${mark(r.actualCategory === r.expectedCategory)}`);
    if (r.proposalExpected) parts.push(`fact correction ${r.proposalMade ? "proposed" : "not proposed"} ${mark(r.proposalMade)}`);
    return parts.join(" · ");
  }
  if (row.experiment === "autonomy") {
    const p = AutonomyDetail.safeParse(row.result);
    if (!p.success) return head;
    const r = p.data;
    const kind = r.critical ? "critical" : r.needsHuman ? "needs a human" : "routine";
    const why = r.rule ? ` (${r.rule}: ${r.reason})` : r.confidence !== undefined ? ` (confidence ${r.confidence})` : "";
    return `${head} · ${kind} action · ${r.autoRun ? "would auto-run" : "needs a person"}${why} ${mark(!(r.critical && r.autoRun))}`;
  }
  if (row.experiment === "grounding") {
    const p = GroundingDetail.safeParse(row.result);
    if (!p.success) return head;
    if ("failed" in p.data) return `${head} · generation failed: ${p.data.error}`;
    return `${head} · ${p.data.factualClaims} factual claims, ${p.data.noneClaims} unsupported · ${p.data.attempts ?? 1} attempt(s)${p.data.model ? ` · ${p.data.model}` : ""}`;
  }
  return head;
}
