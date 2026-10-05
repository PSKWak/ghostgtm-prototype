import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { replayAll } from "@/lib/flow/replay-all";

export const maxDuration = 60;

export async function POST() {
  const r = await replayAll(await getDb());
  return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.reason }, { status: 500 });
}
