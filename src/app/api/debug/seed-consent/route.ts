import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashConsent } from "@/lib/consentHash";

export const dynamic = "force-dynamic";

/**
 * Temporary deploy diagnostic: runs the consent-record seed inline against the
 * live database and returns the exact result/error, so we can see why the
 * build-time patch did not populate the Artifact Integrity dashboard. Idempotent
 * (only seeds when the table is empty). Removed once verified.
 */
export async function GET() {
  const marker = "seed-consent-2db2506";
  try {
    const before = await db.consentRecord.count();
    if (before > 0) {
      return NextResponse.json({ marker, seeded: false, reason: "records already present", before });
    }
    const purposes = await db.purposeTag.findMany({ select: { id: true, name: true } });
    const purposeId = (name: string) => purposes.find((p) => p.name === name)?.id ?? null;
    const day = 86_400_000;
    const now = Date.now();
    const pMarketing = purposeId("Marketing communication") ?? null;
    const pServicing = purposeId("Account servicing") ?? null;
    const base = [
      { subjectRef: "CUST-449120", purposeTagId: pMarketing, channelOrigin: "digital", status: "granted", collectedAt: new Date(now - 60 * day), expiresAt: new Date(now + 700 * day), syncStatus: "synced" as const },
      { subjectRef: "CUST-449120", purposeTagId: pServicing, channelOrigin: "digital", status: "granted", collectedAt: new Date(now - 60 * day), expiresAt: new Date(now + 700 * day), syncStatus: "synced" as const },
      { subjectRef: "CUST-501882", purposeTagId: pServicing, channelOrigin: "branch", status: "granted", collectedAt: new Date(now - 30 * day), expiresAt: new Date(now + 700 * day), syncStatus: "synced" as const, idVerification: "PAN + in-person" },
      { subjectRef: "CUST-501882", purposeTagId: pMarketing, channelOrigin: "branch", status: "withdrawn", collectedAt: new Date(now - 30 * day), syncStatus: "synced" as const, idVerification: "PAN + in-person" },
      { subjectRef: "CUST-612344", purposeTagId: pMarketing, channelOrigin: "phone", status: "granted", collectedAt: new Date(now - 14 * day), expiresAt: new Date(now + 700 * day), syncStatus: "synced" as const },
      { subjectRef: "CUST-733901", purposeTagId: pServicing, channelOrigin: "bulk_import", status: "granted", collectedAt: new Date(now - 5 * day), expiresAt: new Date(now + 700 * day), syncStatus: "synced" as const },
      { subjectRef: "CUST-733901", purposeTagId: pMarketing, channelOrigin: "digital", status: "expired", collectedAt: new Date(now - 400 * day), expiresAt: new Date(now - 30 * day), syncStatus: "synced" as const },
    ];
    const rows = base.map((r) => ({ ...r, artifactHash: hashConsent({ subjectRef: r.subjectRef, purposeTagId: r.purposeTagId, channelOrigin: r.channelOrigin, status: r.status, collectedAt: r.collectedAt }) }));
    const created = await db.consentRecord.createMany({ data: rows });
    // Seed the rejected change-attempts + one deliberately-corrupted record.
    const all = await db.consentRecord.findMany({ orderBy: { collectedAt: "desc" } });
    if ((await db.changeAttempt.count()) === 0 && all.length > 0) {
      const a = all[0];
      await db.changeAttempt.createMany({
        data: [
          { artifactId: a.id, attemptedBy: "integration:crm-sync", attemptedChangeSummary: "Attempted to overwrite status granted → withdrawn via bulk import. Rejected — artifacts are immutable." },
          { artifactId: a.id, attemptedBy: "R. Iyer (admin)", attemptedChangeSummary: "Attempted to edit collected-at timestamp. Rejected — artifacts are immutable." },
        ],
      });
      const b = all.find((x) => x.id !== a.id) ?? a;
      await db.consentRecord.update({ where: { id: b.id }, data: { artifactHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" } });
    }
    const after = await db.consentRecord.count();
    return NextResponse.json({ marker, seeded: true, before, createdCount: created.count, after, pMarketing, pServicing });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ marker, seeded: false, error: e.message, name: e.name, stack: e.stack?.split("\n").slice(0, 4) }, { status: 500 });
  }
}
