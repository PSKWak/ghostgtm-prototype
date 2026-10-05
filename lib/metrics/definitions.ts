import { decisionMetrics } from "./defs/decisions";
import { experimentMetrics } from "./defs/experiments";
import { systemMetrics } from "./defs/system";
import type { MetricDef, MetricRows } from "./types";

// The one metric registry. UI code never computes a metric itself; it calls these.
export const METRICS: MetricDef[] = [...decisionMetrics, ...systemMetrics, ...experimentMetrics];

export const metricById = (id: string) => METRICS.find((m) => m.id === id);

// "Real only": drop every synthetic row before computing.
export const onlyReal = (r: MetricRows): MetricRows => ({
  decisions: r.decisions.filter((x) => !x.isSynthetic),
  blocks: r.blocks.filter((x) => !x.isSynthetic),
  executions: r.executions.filter((x) => !x.isSynthetic),
  generateRuns: r.generateRuns.filter((x) => !x.isSynthetic),
  replays: r.replays,
  experiments: r.experiments.filter((x) => !x.isSynthetic),
});

export type { MetricDef, MetricResult, MetricRows } from "./types";
