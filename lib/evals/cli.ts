import { getDb } from "@/lib/db/client";
import { RUNNABLE, runExperiment, type RunnableExperiment } from "./runner";

// Usage: pnpm exp <grounding|grounding_audit|feedback|autonomy> [--runs N]
// PGlite allows one process per data directory: stop `pnpm dev` first, or set DATABASE_URL.
const [name, flag, value] = process.argv.slice(2);
if (!RUNNABLE.includes(name as RunnableExperiment)) {
  console.error(`Usage: pnpm exp <${RUNNABLE.join("|")}> [--runs N]`);
  process.exit(1);
}
const runsPerAccount = flag === "--runs" ? Number(value) : undefined;
const r = await runExperiment(await getDb(), name as RunnableExperiment, { runsPerAccount });
console.log(r.ok ? `${name}: wrote ${r.value.rows} experiment_runs rows` : `${name} failed: ${r.reason}`);
process.exit(r.ok ? 0 : 1);
