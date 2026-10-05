import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { createTestCaseFromEdit } from "@/lib/flow/test-cases";

const Body = z.object({ editId: z.string().min(1) });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "editId is required" }, { status: 400 });
  const r = await createTestCaseFromEdit(await getDb(), body.data.editId);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 409 });
}
