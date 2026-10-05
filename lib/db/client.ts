import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { count } from "drizzle-orm";
import * as schema from "./schema";
import { accounts } from "./schema";
import { seedDemo } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

// Embedded Postgres (PGlite) by default so the demo needs no install;
// DATABASE_URL switches to a real server with the same schema and migrations.
async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = drizzlePg(url, { schema });
    await migratePg(db, { migrationsFolder });
    return db;
  }
  // Serverless deploys can only write to /tmp; that copy is per-instance and temporary,
  // so a real deployment should set DATABASE_URL.
  const dataDir = process.env.VERCEL ? "/tmp/pglite" : path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const db = drizzlePglite(new PGlite(dataDir), { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

// Next dev reloads modules; keep one connection per process.
const globalForDb = globalThis as unknown as { ghostDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.ghostDb ??= openDb().then(seedIfEmpty).catch((err: unknown) => {
    globalForDb.ghostDb = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  return globalForDb.ghostDb;
}

// A fresh clone should show the demo on first load without a manual seed step.
async function seedIfEmpty(db: Db): Promise<Db> {
  const [row] = await db.select({ n: count() }).from(accounts);
  if ((row?.n ?? 0) === 0) await seedDemo(db, { syntheticHistory: true, walkthrough: true });
  return db;
}

// Fresh in-memory database for tests.
export async function openMemoryDb(): Promise<Db> {
  const db = drizzlePglite(new PGlite(), { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}
