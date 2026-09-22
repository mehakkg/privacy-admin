/**
 * Scenario 7 (assisted / omnichannel) demo — idempotent. Seeds the content-
 * managed document types, a shared consent-template library, an offline queue
 * with pending items on the demo device, a couple of assisted DPRR tickets so
 * the Central Queue shows channel tags, and example multi-channel deliveries.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEVICE_ID = "kiosk-01";

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-omnichannel: no DATABASE_URL, skipping."); return; }

  // 1) Acceptable ID document types (content-managed guidance).
  if ((await prisma.idDocumentType.count()) === 0) {
    const docs = [
      { label: "Aadhaar", note: "Mask all but last 4", sortOrder: 1 },
      { label: "PAN card", note: null, sortOrder: 2 },
      { label: "Passport", note: null, sortOrder: 3 },
      { label: "Voter ID", note: null, sortOrder: 4 },
      { label: "Driving licence", note: null, sortOrder: 5 },
    ];
    for (const d of docs) await prisma.idDocumentType.create({ data: d });
    console.log("patch-omnichannel: seeded ID document types.");
  }

  // 2) Shared consent template library.
  if ((await prisma.consentTemplate.count()) === 0) {
    const templates = [
      { name: "Retail loan onboarding", productOrCampaign: "Personal Loans", fieldConfigJson: JSON.stringify(["subjectRef", "purpose", "idVerification"]) },
      { name: "Savings account KYC", productOrCampaign: "Deposits", fieldConfigJson: JSON.stringify(["subjectRef", "purpose", "idVerification"]) },
      { name: "Festive card campaign", productOrCampaign: "Cards — Q4 campaign", fieldConfigJson: JSON.stringify(["subjectRef", "purpose"]) },
    ];
    for (const t of templates) await prisma.consentTemplate.create({ data: t });
    console.log("patch-omnichannel: seeded consent templates.");
  }

  // 3) Offline queue: 3 pending items captured on the demo device (capture time
  //    locked in the past so the capture-vs-sync distinction is visible on sync).
  if ((await prisma.offlineConsentQueue.count({ where: { deviceId: DEVICE_ID } })) === 0) {
    const base = Date.now() - 3 * 60 * 60 * 1000; // ~3h ago
    const items = [
      { subjectRef: "CUST-9001", captureChannel: "assisted_bc_point", idVerification: "Aadhaar last-4 + OTP" },
      { subjectRef: "CUST-9002", captureChannel: "assisted_branch", idVerification: "Passport in person" },
      { subjectRef: "CUST-9003", captureChannel: "assisted_bc_point", idVerification: "Voter ID in person" },
    ];
    for (let i = 0; i < items.length; i++) {
      await prisma.offlineConsentQueue.create({
        data: {
          consentDraftId: `${DEVICE_ID}-seed-${i + 1}`,
          deviceId: DEVICE_ID,
          subjectRef: items[i].subjectRef,
          captureChannel: items[i].captureChannel,
          idVerification: items[i].idVerification,
          capturedAt: new Date(base + i * 60 * 1000),
          syncStatus: "queued",
        },
      });
    }
    console.log("patch-omnichannel: seeded offline queue (3 pending).");
  }

  // 4) One connected branch ConsentRecord so the synced list + unification have data.
  if ((await prisma.consentRecord.count({ where: { captureChannel: { not: null } } })) === 0) {
    await prisma.consentRecord.create({
      data: {
        subjectRef: "CUST-8801", channelOrigin: "branch", captureChannel: "assisted_branch",
        status: "granted", idVerification: "PAN in person", syncStatus: "synced",
        artifactHash: "sha256:seedbranch…",
      },
    });
    console.log("patch-omnichannel: seeded a connected branch consent record.");
  }

  // 5) Tag a couple of existing tickets as assisted so the Central Queue shows
  //    channel_origin tags and unification sees multiple channels.
  if ((await prisma.dPRRTicket.count({ where: { channelOrigin: { not: "digital" } } })) === 0) {
    const tickets = await prisma.dPRRTicket.findMany({ take: 2, orderBy: { createdAt: "asc" } });
    const channels = ["assisted_branch", "assisted_phone"];
    const prefs = ["branch_handoff", "sms"];
    for (let i = 0; i < tickets.length; i++) {
      await prisma.dPRRTicket.update({ where: { id: tickets[i].id }, data: { channelOrigin: channels[i], preferredNotificationChannel: prefs[i] } });
    }
    if (tickets.length > 0) console.log("patch-omnichannel: tagged existing tickets with assisted channels.");
  }

  // 6) Example multi-channel deliveries for the delivery log.
  if ((await prisma.notification.count({ where: { deliveryChannel: { not: null } } })) === 0) {
    const now = Date.now();
    const deliveries = [
      { channel: "sms", status: "delivered", detail: "Dispatched via sms.", deliveredAt: new Date(now - 40 * 60000), title: "Request AR-DEMO-01 acknowledged" },
      { channel: "call", status: "sent", detail: "Outbound acknowledgment call placed and logged.", deliveredAt: null, title: "Request AR-DEMO-02 acknowledged" },
      { channel: "branch_handoff", status: "manual_pending", detail: "Flagged for manual in-person delivery at the originating branch.", deliveredAt: null, title: "Request AR-DEMO-03 acknowledged" },
      { channel: "sms", status: "failed", detail: "Carrier rejected — invalid number on file.", deliveredAt: null, title: "Request AR-DEMO-04 acknowledged" },
    ];
    for (const d of deliveries) {
      await prisma.notification.create({
        data: {
          targetRole: "admin", triggerEvent: "dprr.request_acknowledged", category: "general_activity",
          title: d.title, body: "Auto-acknowledgment for an assisted request.",
          deliveryChannel: d.channel, deliveryStatus: d.status, deliveryDetail: d.detail, deliveredAt: d.deliveredAt,
        },
      });
    }
    console.log("patch-omnichannel: seeded example multi-channel deliveries.");
  }

  // 7) An initial clean unification check so the monitor shows a health tile.
  if ((await prisma.unificationCheck.count()) === 0) {
    await prisma.unificationCheck.create({
      data: { discrepancyFound: false, discrepancyDetail: null, summaryJson: JSON.stringify({ tickets: {}, consent: {}, offlineQueue: { queued: 3, failed: 0, total: 3 } }), runBy: "system (bootstrap)" },
    });
    console.log("patch-omnichannel: seeded initial unification check.");
  }

  console.log("patch-omnichannel: done.");
}

main().catch((e) => console.error("patch-omnichannel failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
