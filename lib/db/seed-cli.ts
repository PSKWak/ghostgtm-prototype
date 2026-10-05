import { getDb } from "./client";
import { resetDemo } from "./seed";

// PGlite allows one process per data dir: stop `pnpm dev` first, or use POST /api/demo/reset.
const db = await getDb();
await resetDemo(db, { syntheticHistory: true, walkthrough: true });
console.log("Demo data reset.");
process.exit(0);
