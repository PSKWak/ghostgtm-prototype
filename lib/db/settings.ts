import { eq } from "drizzle-orm";
import { DEFAULT_PROMPT_VERSION, isPromptVersion, type PromptVersionId } from "@/lib/llm/prompts";
import type { Db } from "./client";
import * as t from "./schema";

const PROMPT_KEY = "active_prompt_version";

export async function getActivePromptVersion(db: Db): Promise<PromptVersionId> {
  const [row] = await db.select().from(t.settings).where(eq(t.settings.key, PROMPT_KEY));
  return row && isPromptVersion(row.value) ? row.value : DEFAULT_PROMPT_VERSION;
}

export async function setActivePromptVersion(db: Db, version: PromptVersionId): Promise<void> {
  await db.insert(t.settings).values({ key: PROMPT_KEY, value: version })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: version } });
}
