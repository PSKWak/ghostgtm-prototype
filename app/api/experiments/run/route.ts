import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runExperiment } from "@/lib/evals/runner";

// Offline experiments only. The grounding experiment makes ~60–80 paid model calls and
// takes minutes, so it runs from the CLI (`pnpm exp grounding`), never from a button.
const Body = z.object({ name: z.enum(["grounding_audit", "feedback", "autonomy"]) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "this experiment can't be run from the browser" }, { status: 400 });
  const r = await runExperiment(await getDb(), body.data.name);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 422 });
}
