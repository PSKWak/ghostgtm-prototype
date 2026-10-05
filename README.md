# GhostGTM prototype

Post-call follow-up workflow with claim-level evidence, risk-gated approvals, and an
evals console where every number traces to rows. The spec is in [CLAUDE.md](CLAUDE.md).

```bash
pnpm install
pnpm dev          # http://localhost:3000, auto-seeds an embedded Postgres (PGlite) in .data/
pnpm typecheck && pnpm test
```

- `LLM_MODE=fixture` (default) needs no API key. See `.env.example`.
- Set `DATABASE_URL` to use a real Postgres instead of PGlite. The same migrations run on startup.
- **Reset demo:** the button on `/`, or `POST /api/demo/reset`. `pnpm db:seed` does the same,
  but stop `pnpm dev` first, because PGlite allows one process per data directory.
- Schema change: edit `lib/db/schema.ts`, then run `pnpm db:generate`.

## Build status
| Phase | Status |
| --- | --- |
| 1. Schema, seed, Reset demo | done |
| 2. Engine + tests; experiments pre-registered | done (labels still need human review: `reviewedBy: null`) |
| 3. Full journey on fixtures | done |
| 4. Live `generate` (insight + draft, verify + 1 retry, cached fallback) | done; verified with a stubbed model, needs a key to verify live |
| 5. Edits: fact diff, then rule/LLM classification of the rest | done |
| 6. Metric registry, Evals Console, trust ladder, replay, prompt switch | done |
| 7. Experiments and `/evals/experiments` | done; grounding needs a live run |

## Live mode
Set `LLM_MODE=live` in `.env.local`, then choose a provider:
- **Claude (default):** `ANTHROPIC_API_KEY=…` → `claude-opus-5-5`.
- **Groq:** `LLM_PROVIDER=groq` and `GROQ_API_KEY=…` → `openai/gpt-oss-120b`.

Drafts and edit classification then call the model through the Vercel AI SDK; every call is logged in
`ai_runs` with the model that answered. Without a key, everything runs on fixtures.

## Experiments
- `pnpm exp feedback | autonomy | grounding_audit`: offline, also runnable from `/evals/experiments`.
- `LLM_MODE=live pnpm exp grounding [--runs N]`: the measured grounding experiment (paid model calls).
- PGlite allows one process at a time: stop `pnpm dev` before using the CLI, or set `DATABASE_URL`.

**Synthetic demo data:** a deterministic four-week history (57 decisions, 5 shield blocks, 1 failed write, 62 generation
runs) is seeded flagged `is_synthetic` so the Evals Console isn't empty. It shows on `/evals` (cards default to real + synthetic
with the split on each card; *Real only* hides it), never in Slack, the CRM or the workspace, and never counts toward the trust
level. The plan lives in `lib/db/synthetic-plan.ts`. It is illustrative, not a measurement.

**Demo (2 minutes):** `/workspace` → Brightline → *Draft follow-up* → in Slack click *Edit*, change the
renewal date to "December 31, 2026" → *Approve edited & send* → *Confirm & send*. Then open `/crm`,
`/evals` (trust ladder, metrics with intervals, replay table) and `/evals/experiments`.
