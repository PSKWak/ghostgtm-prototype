// One card per experiment, as pre-registered in experiments/*.md. Results never
// live here: they come from experiment_runs through the metric registry.

export type ExperimentStatus = "measured" | "simulated" | "designed";

export type ExperimentCardDef = {
  id: string;
  title: string;
  status: ExperimentStatus;
  hypothesis: string;
  baseline: string;
  method: string;
  data: string;
  passBar: string;
  file: string;
  labelsFile?: string;
  run: { kind: "offline"; experiments: string[] } | { kind: "live"; experiments: string[]; command: string } | { kind: "none"; why: string };
  minSample?: string;
};

export const EXPERIMENT_CARDS: ExperimentCardDef[] = [
  {
    id: "grounding", title: "Grounding", status: "measured", file: "experiments/grounding.md", labelsFile: "experiments/grounding.labels.json",
    hypothesis: "Claim-level evidence with per-claim verification produces fewer unsupported factual claims than document-level citations.",
    baseline: "generate@baseline: same facts, sources listed once per email", method: "generate@v1: every sentence cites its fact ids; verify.ts with one retry",
    data: "3 accounts × 10 runs × 2 arms on the seed fact history", passBar: "Method's 95% interval for unsupported_claim_rate sits entirely below the baseline's.",
    run: { kind: "live", experiments: ["grounding"], command: "LLM_MODE=live pnpm exp grounding" },
  },
  {
    id: "feedback", title: "Feedback learning", status: "measured", file: "experiments/feedback.md", labelsFile: "experiments/feedback.labels.json",
    hypothesis: "Routing each edit or rejection through the taxonomy sends more feedback to the fix that addresses it than sending everything to prompt review.",
    baseline: "approve/reject only; every negative signal goes to prompt review", method: "fact diff + edit classifier + routeFeedback",
    data: "17 labeled cases (10 edits, 7 rejects)", passBar: "routing_accuracy ≥ 13/17 with intervals separate from the baseline's.",
    run: { kind: "offline", experiments: ["feedback"] },
  },
  {
    id: "autonomy", title: "Autonomy", status: "simulated", file: "experiments/autonomy.md", labelsFile: "experiments/autonomy.labels.json",
    hypothesis: "At zero critical auto-executions, risk.ts needs review on fewer actions than approving everything; confidence-only gating can't reach zero criticals.",
    baseline: "approve everything; confidence-only (> 0.8)", method: "risk.ts policy at trust level 3",
    data: "60 labeled synthetic actions", passBar: "critical_auto_executed = 0 and lower human_burden than approve-everything.",
    run: { kind: "offline", experiments: ["autonomy"] },
  },
  {
    id: "references", title: "Reference retrieval", status: "designed", file: "experiments/references.md",
    hypothesis: "Ranking past drafts by similarity × validated outcome × evidence quality lowers the edit rate compared with similarity alone.",
    baseline: "similarity only", method: "similarity × validated outcome × evidence quality", data: "needs live reps",
    passBar: "Edit rate per draft lower, with separated 95% intervals.", minSample: "200 decided drafts per arm",
    run: { kind: "none", why: "Needs live reps producing real decisions." },
  },
  {
    id: "attribution", title: "Attribution", status: "designed", file: "experiments/attribution.md",
    hypothesis: "Accounts that get workflow follow-ups reply and book meetings more within 14 days than matched holdout accounts.",
    baseline: "last-touch attribution", method: "holdout accounts / matched comparison", data: "needs real outcomes",
    passBar: "14-day reply + meeting rate higher, with separated 95% intervals.", minSample: "300 accounts per group",
    run: { kind: "none", why: "Needs real outcomes over weeks." },
  },
];
