import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { generateWorkflow } from "@/lib/flow/generate";

const Body = z.object({ accountId: z.string().min(1) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const r = await generateWorkflow(await getDb(), body.data.accountId, null);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 422 });
}
