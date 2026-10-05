import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { setActivePromptVersion } from "@/lib/db/settings";
import { PROMPT_VERSIONS, type PromptVersionId } from "@/lib/llm/prompts";

const Body = z.object({ version: z.enum(Object.keys(PROMPT_VERSIONS) as [PromptVersionId, ...PromptVersionId[]]) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "unknown prompt version" }, { status: 400 });
  await setActivePromptVersion(await getDb(), body.data.version);
  return NextResponse.json({ version: body.data.version });
}
