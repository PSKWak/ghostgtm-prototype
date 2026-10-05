import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { CURRENT_USER_ID } from "@/lib/current-user";
import { REJECT_REASONS } from "@/lib/engine/types";
import { rejectWorkflow } from "@/lib/flow/reject";

const Body = z.object({
  reason: z.enum(REJECT_REASONS),
  reviewMs: z.number().int().nonnegative(),
  factKey: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "pick one of the four reasons" }, { status: 400 });
  const r = await rejectWorkflow(await getDb(), { workflowId: (await params).id, userId: CURRENT_USER_ID, ...body.data });
  return r.ok ? NextResponse.json({ state: r.value }) : NextResponse.json({ error: r.reason }, { status: 409 });
}
