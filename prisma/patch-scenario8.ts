/**
 * Scenario 8 (consent-infrastructure) demo — idempotent. Seeds entity-scoped
 * consent for the isolation check, webhooks for the delivery test, 21-of-22
 * language variants (one missing) on the demo notice, expired consent for the
 * auto-expiry sweep, and a saved legacy-import mapping.
 */
import { PrismaClient } from "@prisma/client";
import { EIGHTH_SCHEDULE_LANGUAGES } from "../src/lib/dpdp/statute";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-scenario8: no DATABASE_URL, skipping."); return; }

  // 1) Saved legacy-import mapping template.
  if ((await prisma.legacyImportTemplate.count()) === 0) {
    await prisma.legacyImportTemplate.create({ data: { name: "Legacy CRM v3", sourceSystem: "Legacy CRM", mappingJson: JSON.stringify([{ legacyField: "customer_id", schemaField: "subjectRef" }, { legacyField: "consent_ts", schemaField: "collectedAt (capture date)" }]), createdBy: "seed" } });
    console.log("patch-scenario8: seeded legacy import template.");
  }

  // 2) Entity-scoped consent for the isolation check.
  if ((await prisma.consentRecord.count({ where: { entityId: { not: null } } })) === 0) {
    const entities = await prisma.entity.findMany({ take: 2, orderBy: { name: "asc" } });
    if (entities.length >= 2) {
      const [a, b] = entities;
      for (let i = 0; i < 4; i++) await prisma.consentRecord.create({ data: { subjectRef: `${a.name.slice(0, 4).toUpperCase()}-${1000 + i}`, entityId: a.id, channelOrigin: "digital", status: "granted", artifactHash: "sha256:seedA…" } });
      for (let i = 0; i < 3; i++) await prisma.consentRecord.create({ data: { subjectRef: `${b.name.slice(0, 4).toUpperCase()}-${2000 + i}`, entityId: b.id, channelOrigin: "digital", status: "granted", artifactHash: "sha256:seedB…" } });
      console.log(`patch-scenario8: seeded entity-scoped consent (${a.name}/${b.name}).`);
    }
  }

  // 3) Webhooks for the delivery test (one healthy, one that fails).
  if ((await prisma.webhook.count()) === 0) {
    await prisma.webhook.create({ data: { endpoint: "https://partner.acme.com/consent-hook", event: "consent.granted", status: "active" } });
    await prisma.webhook.create({ data: { endpoint: "https://hooks.example.in/consent", event: "consent.withdrawn", status: "active" } });
    console.log("patch-scenario8: seeded webhooks.");
  }

  // 4) 21 of 22 language variants on the first notice (one missing → Santali).
  const notice = await prisma.notice.findFirst({ orderBy: { createdAt: "asc" } });
  if (notice) {
    const existing = await prisma.noticeVariant.count({ where: { noticeId: notice.id } });
    if (existing < 21) {
      const missing = "Santali";
      for (const lang of EIGHTH_SCHEDULE_LANGUAGES) {
        if (lang === missing) continue;
        const has = await prisma.noticeVariant.findFirst({ where: { noticeId: notice.id, language: lang } });
        if (!has) await prisma.noticeVariant.create({ data: { noticeId: notice.id, language: lang, inherit: true, content: "", publishStatus: "qa_passed" } });
      }
      console.log("patch-scenario8: seeded 21 language variants (Santali missing).");
    }
  }

  // 5) Expired consent for the auto-expiry sweep (expiresAt in the past).
  if ((await prisma.consentRecord.count({ where: { expiresAt: { not: null, lt: new Date() }, status: "granted" } })) === 0) {
    const purposes = await prisma.purposeTag.findMany({ where: { status: "approved" }, take: 2, orderBy: { name: "asc" } });
    const past = new Date(Date.now() - 30 * 86400000);
    const collected = new Date(Date.now() - 800 * 86400000);
    if (purposes.length >= 1) {
      // Two under purpose[0] (default auto_withdraw).
      for (let i = 0; i < 2; i++) await prisma.consentRecord.create({ data: { subjectRef: `EXPIRE-${1000 + i}`, purposeTagId: purposes[0].id, channelOrigin: "digital", status: "granted", collectedAt: collected, expiresAt: past, artifactHash: "sha256:seedexp…" } });
      // One under purpose[1] configured for re-consent, if a second purpose exists.
      if (purposes[1]) {
        await prisma.purposeExpiryConfig.upsert({ where: { purposeTagId: purposes[1].id }, update: { behavior: "trigger_reconsent" }, create: { purposeTagId: purposes[1].id, behavior: "trigger_reconsent", updatedBy: "seed" } });
        await prisma.consentRecord.create({ data: { subjectRef: "EXPIRE-2000", purposeTagId: purposes[1].id, channelOrigin: "digital", status: "granted", collectedAt: collected, expiresAt: past, artifactHash: "sha256:seedexp2…" } });
      }
      console.log("patch-scenario8: seeded expired consent for the sweep.");
    }
  }

  console.log("patch-scenario8: done.");
}

main().catch((e) => console.error("patch-scenario8 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
