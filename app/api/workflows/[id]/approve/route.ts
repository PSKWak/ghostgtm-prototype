import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { CURRENT_USER_ID } from "@/lib/current-user";
import { approveWorkflow } from "@/lib/flow/approve";

// An empty sentence removes it. Limits keep a single request from storing or sending megabytes.
const MAX_SENTENCE_CHARS = 1000;
const MAX_EDITS = 50;

const Body = z.object({
  reviewMs: z.number().int().nonnegative(),
  claimEdits: z.array(z.object({ id: z.string().min(1), sentence: z.string().max(MAX_SENTENCE_CHARS) })).max(MAX_EDITS).default([]),
  confirmCorrections: z.boolean().default(false),
  acknowledgeChallenged: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  const r = await approveWorkflow(await getDb(), {
    workflowId: (await params).id, userId: CURRENT_USER_ID, now: new Date().toISOString(), ...body.data,
  });
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 409 });
}
