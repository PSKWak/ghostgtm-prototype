import Link from "next/link";
import { ActivityTables } from "@/components/evals/activity-tables";
import { ClassifierPanel } from "@/components/evals/classifier-panel";
import { ConsoleControls } from "@/components/evals/console-controls";
import { MetricCard } from "@/components/evals/metric-card";
import { ReplayTable } from "@/components/evals/replay-table";
import { TrustLadder } from "@/components/evals/trust-ladder";
import { getDb } from "@/lib/db/client";
import { loadEvalsConsole } from "@/lib/db/views/evals";
import { loadWorkflowViews } from "@/lib/db/views/workflows";

export const dynamic = "force-dynamic";

const GROUPS = [
  { source: "decisions", title: "Rep decisions" },
  { source: "system", title: "Execution and grounding" },
  { source: "experiment", title: "Experiments" },
] as const;

export default async function Evals({ searchParams }: { searchParams: Promise<{ real?: string }> }) {
  // "Real only" is the default for the trust ladder (which always uses real data); the metric
  // cards default to real + synthetic so the demo isn't empty, with the split on every card.
  const realOnly = (await searchParams).real === "1";
  const db = await getDb();
  const [data, views] = await Promise.all([loadEvalsConsole(db, realOnly), loadWorkflowViews(db)]);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Evals Console</h1>
          <p className="text-sm text-muted-foreground">Every number shows its denominator, interval and rows. Hover a metric for its definition.</p>
        </div>
        <ConsoleControls realOnly={realOnly} active={data.activePromptVersion} versions={data.promptVersions} />
      </div>
      {!realOnly && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground" data-testid="synthetic-banner">
          Metrics include flagged synthetic demo history (a four-week sample for illustration, not a measurement). Every card shows its real/synthetic split;
          the trust level below uses real decisions only. <Link className="text-primary hover:underline" href="/evals?real=1">Show real only</Link>
        </p>
      )}
      <TrustLadder trust={data.trust} />
      {GROUPS.map((g) => (
        <section key={g.source} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{g.title}</h2>
            {g.source === "experiment" && <Link className="text-sm text-primary hover:underline" href="/evals/experiments">Experiment cards →</Link>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.metrics.filter((m) => m.def.source === g.source).map((m) => <MetricCard key={m.def.id} data={m} realOnly={realOnly} />)}
          </div>
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="font-semibold">Edit classifier</h2>
        <ClassifierPanel metric={data.metrics.find((m) => m.def.id === "classifier_accuracy")} misses={data.misses} />
      </section>
      <ReplayTable rows={data.replayTable} versions={data.versions} />
      <ActivityTables views={views} />
    </div>
  );
}
