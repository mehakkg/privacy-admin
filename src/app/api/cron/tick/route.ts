import { NextResponse } from "next/server";
import { runTick } from "@/lib/engines/execution";

/**
 * Scheduler entry point.
 *
 * DEVIATION FROM SPEC: the spec suggests BullMQ, which requires Redis. None is
 * available in this environment, so time-driven work runs as an idempotent tick
 * behind this route — driven by Vercel Cron in a deployment, or by the button on
 * the request queue in a demo. Moving to BullMQ means calling `runTick` from a
 * worker instead; nothing else changes.
 */
export async function GET() {
  const result = await runTick();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  return GET();
}
