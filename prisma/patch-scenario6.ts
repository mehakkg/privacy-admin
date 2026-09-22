/**
 * Scenario 6 demo — idempotent. Seeds a data category with members (Screens 2/3),
 * notice language variants incl. one flagged stale (Screens 4–6), and a pending
 * custom cookie category (Screen 7). The script scan (Screen 8) is populated by
 * running it from the UI.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const hash = (s: string) => createHash("sha256").update(s ?? "").digest("hex").slice(0, 16);

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-scenario6: no DATABASE_URL, skipping."); return; }

  // 1) A data category with a few member fields.
  if ((await prisma.dataCategory.count()) === 0) {
    const fields = await prisma.classifiedField.findMany({ take: 4, orderBy: { fieldPath: "asc" } });
    if (fields.length > 0) {
      const cat = await prisma.dataCategory.create({ data: { name: "New product — Loan application", description: "Fields introduced by the loan-application product, grouped for one-shot purpose tagging." } });
      await prisma.classifiedField.updateMany({ where: { id: { in: fields.slice(0, 3).map((f) => f.id) } }, data: { dataCategoryId: cat.id } });
      console.log("patch-scenario6: seeded data category + members.");
    }
  }

  // 2) Notice language variants (one stale). Create a demo notice if the DB has
  //    none, so the release page (variants + device QA + publish gate) has data.
  let notice = await prisma.notice.findFirst({ where: { variants: { none: {} } }, select: { id: true, content: true } })
    ?? await prisma.notice.findFirst({ select: { id: true, content: true } });
  if (!notice) {
    notice = await prisma.notice.create({
      data: { name: "Customer Privacy Notice", status: "draft", content: "We collect identity, contact and transaction data to open and service your accounts, meet KYC and regulatory obligations, and prevent fraud. You may withdraw consent and exercise your rights at any time.", currentVersion: "v1.0", origin: "scratch" },
      select: { id: true, content: true },
    });
  }
  if (notice && (await prisma.noticeVariant.count({ where: { noticeId: notice.id } })) === 0) {
    const base = hash(notice.content ?? "");
    await prisma.noticeVariant.create({ data: { noticeId: notice.id, language: "English", inherit: true, baseHashAtReview: base, publishStatus: "draft" } });
    await prisma.noticeVariant.create({ data: { noticeId: notice.id, language: "Hindi", inherit: true, baseHashAtReview: "staleplaceholder", publishStatus: "draft" } });
    await prisma.noticeVariant.create({ data: { noticeId: notice.id, language: "Tamil", inherit: false, content: "தமிழ் மொழிபெயர்ப்பு — override in force.", baseHashAtReview: base, publishStatus: "draft" } });
    console.log("patch-scenario6: seeded notice variants (Hindi flagged stale).");
  }

  // 3) A pending custom cookie category.
  if ((await prisma.cookieCategory.count({ where: { custom: true } })) === 0) {
    await prisma.cookieCategory.create({ data: { name: "Personalisation", description: "Cookies that tailor on-site content to the user's inferred interests.", defaultState: "off", status: "pending_dpo_approval", custom: true, proposedBy: "R. Iyer (Admin)", proposedAt: new Date() } });
    console.log("patch-scenario6: seeded pending cookie category.");
  }

  console.log("patch-scenario6: done.");
}

main().catch((e) => console.error("patch-scenario6 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
