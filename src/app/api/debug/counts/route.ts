import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Temporary deploy diagnostic: confirms which build is live (marker) and reports
 * raw table counts straight from Prisma, so we can tell whether the deploy
 * pipeline ran the seed/patch steps. Safe to remove once verified.
 */
export async function GET(request: Request) {
  const marker = "deploy-marker-45911b4-consent-seed";
  try {
    // ?reset=checks clears spot-check history so the dashboard returns to its
    // pristine "0 integrity failures / Not checked" default after verification.
    const reset = new URL(request.url).searchParams.get("reset");
    let deletedChecks = 0;
    if (reset === "checks") {
      deletedChecks = (await db.verificationCheck.deleteMany({})).count;
    }
    const [consent, actors, breach, checks, attempts, purposeTags] = await Promise.all([
      db.consentRecord.count(),
      db.actor.count(),
      db.breachIncident.count(),
      db.verificationCheck.count(),
      db.changeAttempt.count(),
      db.purposeTag.count(),
    ]);
    return NextResponse.json({ marker, ok: true, deletedChecks, consent, actors, breach, checks, attempts, purposeTags });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ marker, ok: false, error: e.message, name: e.name }, { status: 500 });
  }
}
