# GhostGTM Prototype — Coding Instructions

## What we're building
A post-call follow-up workflow that runs end to end and learns from rep edits.
A rep's edit (1) corrects the context graph, (2) becomes a regression test, and
(3) moves the agent's trust level. Every number on screen must be explainable
from rows in the database.

One Next.js app, four views over the same tables:
- `/workspace` — account facts with standing, generate follow-up, citations
- `/slack`     — approval cards: Approve / Edit / Reject (4 reasons)
- `/crm`       — simulated outbox and timeline (read-only)
- `/evals`     — decision log, edit taxonomy, trust ladder, test replay (read-mostly)
- `/evals/experiments` — one card per experiment

This is an **Agentic Evidence & Evaluation Layer**: Evidence Router, Grounding Verifier,
Action Risk Agent, Feedback Interpreter, Eval Orchestrator, Outcome Tracker (manual),
Reference Builder (designed). Plus five baseline-vs-method experiments (see below).

Seed accounts: Brightline Freight (stale renewal date: CRM says March 2027),
Halcyon Clinics (open support escalation), Ostrava Robotics (conflicting claims).

## Stack
Next.js App Router + TypeScript (strict), Tailwind + shadcn/ui, Postgres via Drizzle,
Anthropic API through the Vercel AI SDK with Zod schemas, Vitest, one Playwright test.
No agent framework. The workflow is a plain state machine.

## Folder layout
```
app/(workspace|slack|crm|evals)/...   views only, no business logic
app/api/...                           thin routes: validate input, call engine, return
lib/engine/   state-machine.ts  standing.ts  evidence.ts  verify.ts  risk.ts  diff.ts  proposals.ts  references.ts
lib/llm/      prompts/ (versioned files)  schemas.ts  client.ts  fixtures/
lib/metrics/  definitions.ts  compute.ts  stats.ts
lib/evals/    runner.ts  experiments/ (grounding.ts  feedback.ts  autonomy.ts)
experiments/  *.md pre-registrations, *.labels.json ground-truth labels (committed before runs)
lib/db/       schema.ts  seed.ts  queries.ts
tests/        mirrors lib/
```

## Rules that must never break
1. Nothing executes without an Approved decision AND `risk.ts` returning allow.
   `risk.ts` returns one of: allow | require_approval | block, always with a reason.
2. Rejected or risk-blocked workflows never execute.
3. `Completed` only when every execution succeeded and its content hash equals the approved version's hash.
4. Executions are simulated, shown with a SIMULATED badge, unique per (workflow_id, action).
5. Every factual sentence in a draft cites fact IDs that were in the input. Missing values stay "unknown".
6. Standing: human_approved > crm_explicit > ai_inferred > web, then recency. Losers are kept with `superseded_by` and a one-line `reason`.
7. Nothing is promoted to human_approved without a human confirm.
8. LLM calls only in server code. Every output is parsed with Zod. Every call is logged in `ai_runs` with `prompt_version`.
9. `LLM_MODE=fixture` makes every page and test work with no API key.
10. Synthetic data is flagged `is_synthetic = true` and is never mixed silently with real data.

## Code style: clean and understandable
- Engine code is pure functions: input in, result out, no DB or network calls. Routes do the I/O.
- One concept per file. Aim for files under ~150 lines and functions under ~30.
- Name things after the domain: `rankFacts`, `checkShield`, `classifyEdit`, not `process` or `handle`.
- Return explicit results instead of throwing for expected cases:
  `{ ok: true, value } | { ok: false, reason }`. Throw only for bugs.
- No `any`. Domain types live in `lib/engine/types.ts`. Enums are string unions.
- Comments explain *why*, not what. Each rule in `risk.ts` gets a one-line comment naming the risk it prevents.
- No abstraction until the second real use. Prefer obvious code over clever code.
- Constants (thresholds, windows, minimum sample sizes) live in `lib/config.ts` with a comment saying why that value.
- UI components stay dumb: they receive computed data and render it.

## Evals: every number must justify itself
The Evals Console is the product's proof. A number with no visible denominator,
sample size or source rows is a bug.

### 1. One metric registry
Every metric is defined once in `lib/metrics/definitions.ts`:
```ts
type MetricDef = {
  id: string;               // "clean_approval_rate"
  label: string;            // "Clean approval rate"
  question: string;         // "How often do reps approve without editing, while actually reading?"
  numerator: string;        // "approved_clean decisions, excluding rubber stamps"
  denominator: string;      // "all decided workflows (approved + rejected), excluding ignored"
  minSample: number;        // below this, show "Not enough data (n=…)"
  compute: (rows: DecisionRow[]) => MetricResult;
};
type MetricResult = {
  value: number | null;     // null when n < minSample
  numerator: number;
  denominator: number;
  ci95?: [number, number];  // Wilson interval for rates
  rowIds: string[];         // the exact rows that produced it
  realCount: number;
  syntheticCount: number;
};
```
UI code never computes a metric itself; it calls the registry.

### 2. What every displayed number shows
- The value **and** "numerator / denominator" (e.g. `78% (14/18)`).
- The 95% Wilson interval for rates when n < 100.
- A real / synthetic split. A **Real only** toggle, on by default for trust-ladder gates.
- A "Show rows" link that opens the exact decisions behind it.
- A tooltip with the metric's `question`, `numerator` and `denominator` text.
- "Not enough data (n=…)" instead of a number when n < `minSample`.

### 3. Required metrics (start with these, add nothing without a definition)
| id | Definition |
| --- | --- |
| `clean_approval_rate` | approved_clean (not rubber-stamped) / decided |
| `fact_correction_rate` | decisions with ≥1 fact_correction edit / approved |
| `rubber_stamp_rate` | clean approvals under `RUBBER_STAMP_MS` / clean approvals |
| `reject_reason_mix` | count per reject reason / total rejects |
| `critical_error_count` | critical-severity edits + shield blocks, last 20 real decisions |
| `completion_rate` | Completed / Approved |
| `write_fidelity` | executions whose content hash matched approved version / executions |
| `grounding_pass_rate` | `ai_runs` where verify passed first try / generate runs |
| `classifier_accuracy` | correct labels / golden cases, with a confusion matrix |
| `replay_pass_rate` | passing test cases / all test cases, per prompt version |
| `unsupported_claim_rate` | claims labeled `none` / factual claims, per prompt arm |
| `routing_accuracy` | cases routed to the correct fix (graph, prompt, policy, log) / labeled cases |
| `human_burden` | actions needing approval / all actions, per policy |
| `critical_auto_executed` | critical-labeled actions the policy would auto-run (must be 0) |

### 4. Trust ladder explains itself
`computeTrustLevel()` returns the level **and** each gate with its required value,
actual value, and pass/fail, e.g.:
`Real decisions ≥ 20: 23 ✓ · Critical errors in last 20 = 0: 1 ✗ (shield block, wf_812)`.
Any critical error or shield block drops one level immediately; the UI names the event that caused it.
Gates use real data only.

### 5. Classifier and replay results are inspectable
- Classifier: show the confusion matrix and list every miss with expected vs actual label and the `method` (rule or llm).
- Replay: a table of test case × prompt version with pass/fail, and a diff view for any failure.
- A test case created from feedback links back to the decision that created it.

### 6. Metric code is tested by hand-computed fixtures
For every metric: a fixture of ~10 rows, the expected numerator, denominator and value
worked out by hand in a comment, and a Vitest assertion. Include edge cases:
zero denominator, all synthetic, below `minSample`.

## Experiments
Each experiment compares a baseline with our method on the same cases.

| Experiment | Baseline | Method | Metric | Data | Status |
| --- | --- | --- | --- | --- | --- |
| Grounding | `generate@baseline` (document-level citations) | claim-level evidence + per-claim verify | `unsupported_claim_rate` | 3 accounts x 10 runs x 2 arms | measured |
| Feedback learning | approve/reject only, all routed to prompt review | edit/rejection taxonomy routing | `routing_accuracy` + graph corrections | 17 labeled cases | measured |
| Autonomy | approve everything; confidence-only (>0.8) | `risk.ts` policy | `human_burden` at `critical_auto_executed` = 0 | 60 labeled synthetic actions | simulated |
| Reference retrieval | similarity only | similarity x validated outcome x evidence quality | edit rate per draft | needs live reps | designed |
| Attribution | last-touch | holdout accounts / matched comparison | 14-day reply + meeting rate | needs real outcomes | designed |

Rules:
- Pre-register: hypothesis, metric, pass bar in `experiments/<name>.md`, committed before the first run.
- Ground-truth labels live in `experiments/<name>.labels.json`, committed before tuning any policy or prompt.
- Same inputs, same temperature, same fact history for every arm.
- Results come only from `experiment_runs` rows through the metrics registry. Never hard-code a result.
- Report rates with Wilson 95% intervals. Claim an improvement only if intervals don't overlap;
  otherwise the card says "no measurable difference at n=…".
- Grounding: also record agreement between `verify.ts` and 12 hand-labeled drafts (the judge is audited).
- Card status is exactly one of measured | simulated | designed, shown on screen.
  Designed cards show hypothesis, metric and minimum sample, never a result.
- If the method loses to the baseline, the card says so. Do not tune after seeing results without
  creating a new pre-registered version.

## How to work on each task
1. Restate the task in two lines and name the files you will touch.
2. Write or update tests first for any engine or metrics code.
3. Implement the smallest change that passes.
4. Run `pnpm typecheck && pnpm test`. Don't say "done" unless both pass.
5. Report back in this format:
   - **Changed:** files and one line each
   - **Tests:** what was added, pass count
   - **Verified by hand:** the URL path and what you clicked
   - **Not done / risks:** anything skipped or uncertain
6. If a rule above conflicts with the request, stop and ask instead of working around it.

## Build phases (finish and verify each before the next)
1. Schema, seed (with `is_synthetic`), Reset demo route.
2. Engine with tests: state machine, standing, risk (3 tiers), verify (per-claim labels), diff.
   Pre-register experiments and commit labels.
3. Views on fixtures: Flow A end to end with no LLM.
4. Live `generate` (insight + draft in one call), verify with one retry, cached-run fallback.
5. Edits: deterministic diff first (dates, money, numbers, names vs cited facts), LLM only for leftover spans; proposals and confirm.
6. Metrics registry, Evals Console, trust ladder, Turn into test case, prompt version switch, replay.
7. Experiments: `generate@baseline`, experiment runners, `/evals/experiments` cards.

## Out of scope
Auth beyond a user picker, real HubSpot or Gmail writes, real Slack app, MCP server,
live web scraping, automatic prompt changes, measured revenue attribution, agent frameworks,
Discord, voice.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
