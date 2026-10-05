import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { redraftWorkflow } from "@/lib/flow/redraft";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await redraftWorkflow(await getDb(), (await params).id);
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 409 });
}
