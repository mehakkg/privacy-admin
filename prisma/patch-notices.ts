/**
 * Idempotent backfill for the Notices revision.
 *
 * Unlike the seed (which only runs on an EMPTY database), this runs on every
 * deploy: it brings existing notice rows up to the new data shape — Fiduciary,
 * Data Category, Purpose, Rule 3 content/confirmations — and ensures the second
 * Fiduciary's notice exists so the Fiduciary filter demonstrably narrows.
 *
 * Every write is keyed by a known id and is a plain update/upsert, so running it
 * repeatedly is a no-op after the first time. It never deletes anything and is
 * safe to run against a database people are already clicking through.
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

/** Canonical consent-artifact hash — MUST match src/lib/consentHash.ts exactly. */
function hashConsent(c: { subjectRef: string; purposeTagId: string | null; channelOrigin: string; status: string; collectedAt: Date }): string {
  const canonical = [c.subjectRef, c.purposeTagId ?? "", c.channelOrigin, c.status, c.collectedAt.toISOString()].join("|");
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

/**
 * Consent-artifact integrity demo. Backfills the stored hash on records that
 * predate it, then (once) seeds two rejected change-attempts on one record and a
 * deliberately-corrupted hash on another so the Mismatch state is demonstrable.
 */
async function backfillConsentIntegrity() {
  const records = await prisma.consentRecord.findMany();
  for (const r of records) {
    if (!r.artifactHash?.startsWith("sha256:")) {
      await prisma.consentRecord.update({ where: { id: r.id }, data: { artifactHash: hashConsent(r) } });
    }
  }
  if ((await prisma.changeAttempt.count()) === 0 && records.length > 0) {
    const a = records[0];
    await prisma.changeAttempt.createMany({
      data: [
        { artifactId: a.id, attemptedBy: "integration:crm-sync", attemptedChangeSummary: "Attempted to overwrite status granted → withdrawn via bulk import. Rejected — artifacts are immutable." },
        { artifactId: a.id, attemptedBy: "R. Iyer (admin)", attemptedChangeSummary: "Attempted to edit collected-at timestamp. Rejected — artifacts are immutable." },
      ],
    });
    // One deliberately-corrupted record to demonstrate the Mismatch state.
    const b = records.find((x) => x.id !== a.id) ?? a;
    await prisma.consentRecord.update({ where: { id: b.id }, data: { artifactHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" } });
  }
  console.log("patch-notices: consent integrity backfilled.");
}

const RULE3_ALL = JSON.stringify({
  itemization: { note: "Data categories itemised in the body." },
  purpose: { note: "Purpose stated in the opening paragraph." },
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("patch-notices: no DATABASE_URL, skipping.");
    return;
  }

  // Only patch if the target rows exist — a fresh DB was already seeded with the
  // correct shape, so there is nothing to backfill.
  const meridian = await prisma.entity.findFirst({ where: { name: "Meridian Financial Services" } });
  const northgate = await prisma.entity.findFirst({ where: { name: "Northgate Lending" } });
  if (!meridian) {
    console.log("patch-notices: no Meridian entity, database not seeded yet — skipping.");
    return;
  }

  const purposes = await prisma.purposeTag.findMany({ select: { id: true, name: true } });
  const purposeId = (name: string) => purposes.find((p) => p.name === name)?.id ?? null;

  const patch = async (id: string, data: Record<string, unknown>) => {
    const existing = await prisma.notice.findUnique({ where: { id } });
    if (!existing) return;
    await prisma.notice.update({ where: { id }, data });
  };

  await patch("notice_privacy", {
    fiduciaryId: meridian.id,
    dataCategory: "kyc",
    purposeTagId: purposeId("Account servicing"),
    content:
      "We collect and process the following personal data — identity, contact, " +
      "KYC and transaction records — to open and service your accounts, meet our " +
      "KYC and regulatory obligations, and prevent fraud. " +
      "You may withdraw consent at any time: https://meridian.example.in/consent/withdraw. " +
      "Exercise your rights (access, correct, erase, nominate): https://meridian.example.in/rights. " +
      "Complain to the Data Protection Board: https://meridian.example.in/grievance/board.",
    rule3ManualJson: RULE3_ALL,
  });

  await patch("notice_cookie", {
    fiduciaryId: meridian.id,
    dataCategory: "behavioural",
    purposeTagId: purposeId("Service improvement"),
    content:
      "This site uses cookies for behavioural analytics to improve the service. " +
      "Withdraw consent: https://meridian.example.in/cookies/withdraw. " +
      "Exercise your rights: https://meridian.example.in/rights. " +
      "Complain to the Board: https://meridian.example.in/grievance/board.",
    rule3ManualJson: RULE3_ALL,
  });

  await patch("notice_marketing", {
    fiduciaryId: meridian.id,
    dataCategory: "behavioural",
    purposeTagId: purposeId("Marketing communication"),
    currentVersion: "v1.5",
    content:
      "We would like to send you marketing communications about our products. " +
      "You can exercise your rights here: https://meridian.example.in/rights.",
    rule3ManualJson: JSON.stringify({
      itemization: { note: "Marketing preferences and contact details itemised above." },
      purpose: { note: "Purpose: marketing communication, stated in the first line." },
    }),
  });

  // The second Fiduciary's notice — created once, by a stable id.
  if (northgate) {
    await prisma.notice.upsert({
      where: { id: "notice_northgate" },
      update: {},
      create: {
        id: "notice_northgate",
        name: "Northgate Lending Loan Notice",
        status: "draft",
        currentVersion: "v0.2",
        origin: "scratch",
        fiduciaryId: northgate.id,
        dataCategory: "kyc",
        purposeTagId: purposeId("Account servicing"),
        content: "Notice for loan applicants of Northgate Lending. Draft — pending content.",
        regionsJson: JSON.stringify([]),
      },
    });
  }

  console.log("patch-notices: notice metadata backfilled.");
  await backfillConsentIntegrity();
}

main()
  .catch((error) => {
    console.error("patch-notices failed (continuing):", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
