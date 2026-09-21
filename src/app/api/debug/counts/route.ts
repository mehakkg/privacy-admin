import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Temporary deploy diagnostic: confirms which build is live (marker) and reports
 * raw table counts straight from Prisma, so we can tell whether the deploy
 * pipeline ran the seed/patch steps. Safe to remove once verified.
 */
export async function GET() {
  const marker = "deploy-marker-45911b4-consent-seed";
  try {
    const [consent, actors, breach, checks, attempts, purposeTags] = await Promise.all([
      db.consentRecord.count(),
      db.actor.count(),
      db.breachIncident.count(),
      db.verificationCheck.count(),
      db.changeAttempt.count(),
      db.purposeTag.count(),
    ]);
    return NextResponse.json({ marker, ok: true, consent, actors, breach, checks, attempts, purposeTags });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ marker, ok: false, error: e.message, name: e.name }, { status: 500 });
  }
}
