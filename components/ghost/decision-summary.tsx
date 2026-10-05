import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import type { WorkflowView } from "@/lib/db/views/workflows";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = {
  approved_clean: "Approved as written", approved_edited: "Approved with edits", rejected: "Rejected", ignored: "Ignored",
};

// What happened after the decision, in the order the rep cares about.
export function DecisionSummary({ wf }: { wf: WorkflowView }) {
  if (!wf.decision) {
    if (wf.state === "blocked") return <p className="mt-3 text-sm text-muted-foreground">Nothing was sent. The block is recorded as eval data.</p>;
    if (wf.state === "expired") return <p className="mt-3 text-sm text-muted-foreground">Replaced by a fresh draft after the record changed. Nothing was sent.</p>;
    return null;
  }
  const d = wf.decision;
  return (
    <div className="mt-3 space-y-2 text-sm" data-testid="decision-summary">
      <p>
        <b>{KIND[d.kind] ?? d.kind}</b>{d.rejectReason && <>: {d.rejectReason.replace(/_/g, " ")}</>}{d.rejectFact && <> ({d.rejectFact})</>} by {d.userName}
        <span className="text-muted-foreground"> · reviewed for {Math.round(d.reviewMs / 1000)}s</span>
      </p>
      {wf.corrections.map((c) => (
        <p key={c.label} className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden />Record corrected: <span>{c.label}</span> {c.from} → <b>{c.to}</b>
        </p>
      ))}
      {wf.tests.filter((x) => !x.retired).map((x) => (
        <p key={x.name} className={cn("flex items-center gap-1.5", x.passed === null ? "text-muted-foreground" : x.passed ? "text-emerald-800 dark:text-emerald-300" : "text-red-700")} data-testid="regression-test">
          {x.passed === false ? <XCircle className="size-4" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
          Regression test {x.passed === null ? "added, replays on the next draft" : x.passed ? "passing" : "failing"}: {x.name}
        </p>
      ))}
    </div>
  );
}
