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
| 2. Engine + tests; experiments pre-registered | done (labels need human review before commit) |
| 3. Full journey on fixtures (pulled in the rule-based learning loop from 5–6) | done |
| 4–7 | not started |

**Demo (2 minutes):** `/workspace` → Brightline → *Draft follow-up* → in Slack click *Edit*, change the
renewal date to "December 31, 2026" → *Approve edited & send* → *Confirm & send*. Then open `/crm`
(email, note, task), `/evals` (decision, edit, passing regression test), and draft Brightline again:
the next draft already has the corrected date. `pnpm test:e2e` runs this in a real browser.
