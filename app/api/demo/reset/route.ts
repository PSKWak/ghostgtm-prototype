import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resetDemo } from "@/lib/db/seed";

export async function POST() {
  await resetDemo(await getDb(), { syntheticHistory: true });
  return NextResponse.json({ ok: true });
}
