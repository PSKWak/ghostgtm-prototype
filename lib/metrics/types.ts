import type { DecisionKind, EditCategory, RejectReason, Severity, WorkflowState } from "@/lib/engine/types";

// The rows metrics are computed from. Loaded once by compute.ts; definitions are pure.

export type DecisionRow = {
  id: string; workflowId: string; kind: DecisionKind; rejectReason: RejectReason | null;
  reviewMs: number; decidedAt: string; isSynthetic: boolean;
  editCategories: EditCategory[]; editSeverities: Severity[]; workflowState: WorkflowState;
};
export type BlockRow = { id: string; at: string; isSynthetic: boolean }; // a workflow the shield held
export type ExecutionRow = { id: string; workflowId: string; hashMatches: boolean; isSynthetic: boolean };
export type GenerateRunRow = { id: string; mode: "live" | "cached" | "fixture"; verifyPassedFirstTry: boolean | null; isSynthetic: boolean }; // attempt 1 only
export type ReplayRow = { id: string; testCaseId: string; promptVersion: string; passed: boolean; ranAt: string };
export type ExperimentRow = { id: string; experiment: string; arm: string; caseId: string; isSynthetic: boolean; result: unknown };

export type MetricRows = {
  decisions: DecisionRow[]; blocks: BlockRow[]; executions: ExecutionRow[];
  generateRuns: GenerateRunRow[]; replays: ReplayRow[]; experiments: ExperimentRow[];
};

export type Breakdown = { key: string; label: string; numerator: number; denominator: number; value: number | null; ci95?: [number, number] };

export type MetricResult = {
  value: number | null; // null when n < minSample
  numerator: number;
  denominator: number;
  ci95?: [number, number]; // Wilson interval for rates
  rowIds: string[]; // the exact rows that produced it
  numeratorIds?: string[]; // the subset of rowIds that counted toward the numerator
  realCount: number;
  syntheticCount: number;
  breakdown?: Breakdown[]; // per reason, per arm or per prompt version
  matrix?: { labels: string[]; counts: number[][] }; // classifier confusion matrix (rows = expected)
};

export type MetricDef = {
  id: string;
  label: string;
  question: string;
  numerator: string;
  denominator: string;
  minSample: number;
  kind: "rate" | "count";
  source: "decisions" | "system" | "experiment";
  compute: (rows: MetricRows) => MetricResult;
};
