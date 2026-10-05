import { beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { openMemoryDb, type Db } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";
import * as t from "@/lib/db/schema";

let db: Db;
beforeAll(async () => {
  db = await openMemoryDb();
  await resetDemo(db);
});

describe("seed", () => {
  it("loads the three demo accounts, flagged non-synthetic", async () => {
    const rows = await db.select().from(t.accounts);
    expect(rows.map((r) => r.name).sort()).toEqual(["Brightline Freight", "Halcyon Clinics", "Ostrava Robotics"]);
    expect(rows.every((r) => r.isSynthetic === false)).toBe(true);
  });

  it("keeps the stale CRM renewal date as current for Brightline, with the call value superseded", async () => {
    const rows = await db.select().from(t.facts).where(eq(t.facts.key, "renewal_date"));
    const current = rows.filter((r) => r.supersededBy === null);
    expect(current.map((r) => r.value)).toEqual(["2027-03-31"]);
    const loser = rows.find((r) => r.id === "f_bf_renewal_call");
    expect(loser?.supersededBy).toBe("f_bf_renewal_crm");
    expect(loser?.supersededReason).toBe("crm_explicit outranks ai_inferred");
  });

  it("stores missing values as null (unknown), never invented", async () => {
    const [row] = await db.select().from(t.facts).where(eq(t.facts.id, "f_bf_budget"));
    expect(row?.value).toBeNull();
  });

  it("has exactly one current fact per account and key", async () => {
    const current = await db.select().from(t.facts).where(isNull(t.facts.supersededBy));
    const keys = current.map((r) => `${r.accountId}/${r.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is idempotent: reset twice gives the same row counts", async () => {
    const before = (await db.select().from(t.facts)).length;
    await resetDemo(db);
    expect((await db.select().from(t.facts)).length).toBe(before);
  });

  it("rejects a human_approved fact with no confirming user (rule 7)", async () => {
    const insert = db.insert(t.facts).values({
      id: "f_bad", accountId: "acct_brightline", key: "renewal_date", value: "2026-12-31",
      source: "human_approved", sourceRef: "test", observedAt: new Date(),
    });
    await expect(insert).rejects.toThrow();
  });

  it("refuses a second execution of the same action for a workflow (rule 4)", async () => {
    await db.insert(t.workflows).values({ id: "wf_t", accountId: "acct_brightline", state: "approved", promptVersion: "generate@v1" });
    await db.insert(t.drafts).values({ id: "d_t", workflowId: "wf_t", version: 1, author: "agent", content: { subject: "s", claims: [] }, contentHash: "h" });
    const exec = { workflowId: "wf_t", action: "send_email" as const, draftId: "d_t", contentHash: "h", status: "succeeded" as const, payload: { kind: "note" as const, body: "x" } };
    await db.insert(t.executions).values({ id: "ex_1", ...exec });
    await expect(db.insert(t.executions).values({ id: "ex_2", ...exec })).rejects.toThrow();
  });
});
