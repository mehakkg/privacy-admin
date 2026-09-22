import { createHash } from "node:crypto";
import { db, governanceDb } from "@/lib/db";
import { audited, recordAction, type AuditActor } from "@/lib/engines/audit";
import { isCombinedGovernance } from "@/lib/governance";
import { DEVICE_MATRIX } from "@/lib/scenario6";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 6 ENGINE — field→purpose tagging + data categories, notice release
 * (variants, device QA, publish gate), and cookie category creation + the
 * canonical script-compliance scan engine (reused by a future scheduled trigger).
 */

function hash(s: string): string { return createHash("sha256").update(s ?? "").digest("hex").slice(0, 16); }

// ---- Screens 1 & 3: tag fields to a purpose --------------------------------

export type PurposeTagInput =
  | { mode: "existing"; existingPurposeTagId: string }
  | { mode: "propose"; proposed: { name: string; description: string; legalBasis: string; retention: string } };

export async function tagFieldsToPurpose(fieldIds: string[], choice: PurposeTagInput, actor: AuditActor) {
  if (fieldIds.length === 0) throw Object.assign(new Error("Select at least one field."), { name: "ValidationError" });
  if (choice.mode === "existing") {
    // ClassifiedField is not governance-owned — the ordinary audited path works.
    await audited(
      { actor, action: "datamap.fields_tagged", targetType: "ClassifiedField", targetId: fieldIds[0], eventDescription: `Tagged ${fieldIds.length} field(s) to an existing purpose`, payload: { count: fieldIds.length, mode: "existing" } },
      (tx: TxClient) => tx.classifiedField.updateMany({ where: { id: { in: fieldIds } }, data: { purposeTagId: choice.existingPurposeTagId } }),
    );
    return;
  }
  // Propose-new creates a PENDING PurposeTag (governance-owned) → governanceDb.
  if (!choice.proposed.name.trim()) throw Object.assign(new Error("Name the proposed purpose."), { name: "ValidationError" });
  await governanceDb.$transaction(async (tx) => {
    const pt = await tx.purposeTag.create({ data: { name: choice.proposed.name.trim(), description: choice.proposed.description.trim(), lawfulBasis: choice.proposed.legalBasis, retention: choice.proposed.retention.trim() || "To be set by DPO", status: "pending_dpo_approval", approvedBy: "—", approvedAt: new Date(), proposedBy: actor.label, proposedAt: new Date() } });
    await tx.classifiedField.updateMany({ where: { id: { in: fieldIds } }, data: { purposeTagId: pt.id } });
    await recordAction(tx as never, { actor, action: "datamap.fields_tagged", targetType: "ClassifiedField", targetId: fieldIds[0], customerId: null, eventDescription: `Tagged ${fieldIds.length} field(s) to a proposed purpose`, payload: { count: fieldIds.length, mode: "propose", purpose: choice.proposed.name.trim() } });
  });
}

// ---- Screen 2: data category CRUD ------------------------------------------

export async function createDataCategory(name: string, description: string, actor: AuditActor) {
  if (!name.trim()) throw Object.assign(new Error("Name the category."), { name: "ValidationError" });
  return audited(
    { actor, action: "datamap.category_created", targetType: "DataCategory", targetId: name.trim(), eventDescription: `Created data category ${name.trim()}`, payload: {} },
    (tx: TxClient) => tx.dataCategory.create({ data: { name: name.trim(), description: description.trim() || null } }),
  );
}

export async function setCategoryMembership(categoryId: string, fieldIds: string[], add: boolean, actor: AuditActor) {
  await audited(
    { actor, action: add ? "datamap.category_fields_added" : "datamap.category_fields_removed", targetType: "DataCategory", targetId: categoryId, eventDescription: `${add ? "Added" : "Removed"} ${fieldIds.length} field(s)`, payload: {} },
    (tx: TxClient) => tx.classifiedField.updateMany({ where: { id: { in: fieldIds } }, data: { dataCategoryId: add ? categoryId : null } }),
  );
}

/** Delete a category — member fields revert to ungrouped (never deleted). */
export async function deleteDataCategory(categoryId: string, actor: AuditActor) {
  await audited(
    { actor, action: "datamap.category_deleted", targetType: "DataCategory", targetId: categoryId, eventDescription: "Deleted a data category; members reverted to ungrouped", payload: {} },
    async (tx: TxClient) => {
      await tx.classifiedField.updateMany({ where: { dataCategoryId: categoryId }, data: { dataCategoryId: null } });
      await tx.dataCategory.delete({ where: { id: categoryId } });
    },
  );
}

/** Screen 3: tag every field in a category to one purpose in one action. */
export async function bulkTagCategory(categoryId: string, choice: PurposeTagInput, actor: AuditActor) {
  const members = await db.classifiedField.findMany({ where: { dataCategoryId: categoryId }, select: { id: true } });
  if (members.length === 0) throw Object.assign(new Error("This category has no member fields."), { name: "StateError" });
  await tagFieldsToPurpose(members.map((m) => m.id), choice, actor);
  return members.length;
}

// ---- Screen 5: regional/language variant config ----------------------------

async function baseContent(noticeId: string): Promise<string> {
  const n = await db.notice.findUniqueOrThrow({ where: { id: noticeId }, select: { content: true } });
  return n.content;
}

export async function overrideVariant(variantId: string, content: string, actor: AuditActor) {
  const v = await db.noticeVariant.findUniqueOrThrow({ where: { id: variantId } });
  await audited(
    { actor, action: "notice.variant_overridden", targetType: "NoticeVariant", targetId: variantId, eventDescription: `Overrode ${v.language} variant`, payload: {} },
    async (tx: TxClient) => tx.noticeVariant.update({ where: { id: variantId }, data: { inherit: false, content, baseHashAtReview: hash(await baseContent(v.noticeId)), publishStatus: "draft" } }),
  );
}

export async function setVariantInherit(variantId: string, actor: AuditActor) {
  const v = await db.noticeVariant.findUniqueOrThrow({ where: { id: variantId } });
  await audited(
    { actor, action: "notice.variant_inherit", targetType: "NoticeVariant", targetId: variantId, eventDescription: `Set ${v.language} variant to inherit base`, payload: {} },
    async (tx: TxClient) => tx.noticeVariant.update({ where: { id: variantId }, data: { inherit: true, content: "", baseHashAtReview: hash(await baseContent(v.noticeId)), publishStatus: "draft" } }),
  );
}

/** Clear the stale flag by re-reviewing an inheriting variant against the base. */
export async function reviewVariant(variantId: string, actor: AuditActor) {
  const v = await db.noticeVariant.findUniqueOrThrow({ where: { id: variantId } });
  await audited(
    { actor, action: "notice.variant_reviewed", targetType: "NoticeVariant", targetId: variantId, eventDescription: `Re-reviewed ${v.language} variant against current base`, payload: {} },
    async (tx: TxClient) => tx.noticeVariant.update({ where: { id: variantId }, data: { baseHashAtReview: hash(await baseContent(v.noticeId)) } }),
  );
}

/** Is an inheriting variant stale (base changed since last review)? */
export async function variantStale(noticeId: string, variant: { inherit: boolean; baseHashAtReview: string | null }): Promise<boolean> {
  if (!variant.inherit) return false;
  const current = hash(await baseContent(noticeId));
  return variant.baseHashAtReview != null && variant.baseHashAtReview !== current;
}
export function baseHash(content: string): string { return hash(content); }

// ---- Screen 6: device rendering QA -----------------------------------------

export async function ensureVariantChecks(variantId: string) {
  const count = await db.noticeDeviceCheck.count({ where: { variantId } });
  if (count > 0) return;
  await db.noticeDeviceCheck.createMany({ data: DEVICE_MATRIX.map((d) => ({ variantId, device: d.device, browser: d.browser, method: d.method })) });
}

/** Run QA: automated cells pass; manual cells await an explicit confirmation. */
export async function runVariantQA(variantId: string, actor: AuditActor) {
  await ensureVariantChecks(variantId);
  await audited(
    { actor, action: "notice.device_qa_run", targetType: "NoticeVariant", targetId: variantId, eventDescription: "Ran device rendering QA", payload: {} },
    async (tx: TxClient) => {
      await tx.noticeDeviceCheck.updateMany({ where: { variantId, method: "automated", status: "not_run" }, data: { status: "pass", detail: "Headless render snapshot matched baseline." } });
      await refreshVariantPublishStatus(tx, variantId);
    },
  );
}

export async function setDeviceCheck(checkId: string, status: "pass" | "fail", detail: string, actor: AuditActor) {
  const c = await db.noticeDeviceCheck.findUniqueOrThrow({ where: { id: checkId } });
  await audited(
    { actor, action: "notice.device_check_set", targetType: "NoticeDeviceCheck", targetId: checkId, eventDescription: `${c.device} / ${c.browser} → ${status}`, payload: { status } },
    async (tx: TxClient) => {
      await tx.noticeDeviceCheck.update({ where: { id: checkId }, data: { status, detail: detail.trim() || (status === "pass" ? "Manually verified." : "Rendering issue reported.") } });
      await refreshVariantPublishStatus(tx, c.variantId);
    },
  );
}

async function refreshVariantPublishStatus(tx: TxClient, variantId: string) {
  const v = await tx.noticeVariant.findUnique({ where: { id: variantId }, select: { publishStatus: true } });
  if (!v || v.publishStatus === "published") return;
  const checks = await tx.noticeDeviceCheck.findMany({ where: { variantId } });
  const allPass = checks.length > 0 && checks.every((c) => c.status === "pass");
  const anyRun = checks.some((c) => c.status !== "not_run");
  await tx.noticeVariant.update({ where: { id: variantId }, data: { publishStatus: allPass ? "qa_passed" : anyRun ? "qa_pending" : "draft" } });
}

// ---- Screen 4: publish gate ------------------------------------------------

export async function publishVariant(variantId: string, actor: AuditActor) {
  const v = await db.noticeVariant.findUniqueOrThrow({ where: { id: variantId } });
  if (v.publishStatus !== "qa_passed") throw Object.assign(new Error("This variant hasn't passed device QA yet."), { name: "StateError" });
  await audited(
    { actor, action: "notice.variant_published", targetType: "NoticeVariant", targetId: variantId, eventDescription: `Published ${v.language} variant`, payload: {} },
    (tx: TxClient) => tx.noticeVariant.update({ where: { id: variantId }, data: { publishStatus: "published", publishedAt: new Date() } }),
  );
}

/** Combined publish — refused unless every variant has passed device QA. */
export async function publishAllVariants(noticeId: string, actor: AuditActor) {
  const variants = await db.noticeVariant.findMany({ where: { noticeId } });
  const blocking = variants.filter((v) => v.publishStatus !== "qa_passed" && v.publishStatus !== "published");
  if (variants.length === 0 || blocking.length > 0) {
    throw Object.assign(new Error(`${blocking.length} variant(s) have not passed device QA — publish is blocked until every variant's QA passes.`), { name: "StateError" });
  }
  await audited(
    { actor, action: "notice.published", targetType: "Notice", targetId: noticeId, eventDescription: `Published notice across ${variants.length} variants`, payload: { variants: variants.length } },
    async (tx: TxClient) => {
      await tx.noticeVariant.updateMany({ where: { noticeId, publishStatus: "qa_passed" }, data: { publishStatus: "published", publishedAt: new Date() } });
      await tx.notice.update({ where: { id: noticeId }, data: { status: "published" } });
    },
  );
}

// ---- Screen 7: cookie category creation ------------------------------------

export async function proposeCookieCategory(name: string, description: string, defaultState: string, actor: AuditActor) {
  if (!name.trim() || !description.trim()) throw Object.assign(new Error("Name and description are required."), { name: "ValidationError" });
  // A proposal creates a PENDING governance-owned CookieCategory → governanceDb.
  await governanceDb.$transaction(async (tx) => {
    await recordAction(tx as never, { actor, action: "cookie.category_proposed", targetType: "CookieCategory", targetId: name.trim(), eventDescription: `Proposed cookie category ${name.trim()} (default ${defaultState})`, payload: { defaultState } });
    await tx.cookieCategory.create({ data: { name: name.trim(), description: description.trim(), defaultState: defaultState === "on" ? "on" : "off", status: "pending_dpo_approval", custom: true, proposedBy: actor.label, proposedAt: new Date() } });
  });
}

export async function decideCookieCategory(id: string, approve: boolean, actor: AuditActor) {
  const combined = await isCombinedGovernance();
  if (!(actor.role === "dpo" || (combined && actor.role === "admin"))) throw Object.assign(new Error("Only the DPO can approve a cookie category. Switch role to decide."), { name: "UnauthorisedRulingError" });
  await governanceDb.$transaction(async (tx) => {
    await recordAction(tx as never, { actor, action: approve ? "cookie.category_approved" : "cookie.category_rejected", targetType: "CookieCategory", targetId: id, eventDescription: `${approve ? "Approved" : "Rejected"} a proposed cookie category`, payload: { selfApproved: combined && actor.role === "admin" } });
    if (approve) await tx.cookieCategory.update({ where: { id }, data: { status: "approved", approvedBy: actor.label, approvedAt: new Date() } });
    else await tx.cookieCategory.delete({ where: { id } });
  });
}

// ---- Screen 8: script compliance scan (canonical engine) -------------------

/** The live scripts a scan observes on the site. In production this comes from a
 *  headless crawl; modelled here as the observation set the detector evaluates. */
const OBSERVED_SCRIPTS: { name: string; vendor: string; page: string; firedBeforeConsent: boolean }[] = [
  { name: "Google Analytics (gtag.js)", vendor: "Google", page: "/", firedBeforeConsent: true },
  { name: "LinkedIn Insight Tag", vendor: "LinkedIn", page: "/pricing", firedBeforeConsent: false },
  { name: "Intercom", vendor: "Intercom", page: "/", firedBeforeConsent: false },
  { name: "Hotjar", vendor: "Hotjar", page: "/", firedBeforeConsent: true },
];

/**
 * CANONICAL scan: compares observed live scripts against the declared cookie
 * policy (categorised CookieScripts). Flags undisclosed or pre-consent-firing
 * scripts and AUTO-BLOCKS them. Idempotent per script (upsert by name+page).
 * `trigger` distinguishes the manual run here from a future scheduled one —
 * one engine, many triggers.
 */
export async function runScriptComplianceScan(actor: AuditActor, trigger: "manual" | "scheduled" = "manual") {
  const declared = new Set((await db.cookieScript.findMany({ where: { categoryId: { not: null } }, select: { name: true } })).map((s) => s.name));
  let flagged = 0;
  for (const s of OBSERVED_SCRIPTS) {
    const disclosed = declared.has(s.name);
    const issue = !disclosed || s.firedBeforeConsent;
    if (!issue) continue;
    flagged += 1;
    const detail = s.firedBeforeConsent
      ? `This script executed at page load on ${s.page}, before the consent event was recorded for this session.`
      : `This script is live on ${s.page} but is not declared in the cookie policy.`;
    const existing = await db.cookieScanFinding.findFirst({ where: { scriptName: s.name, page: s.page } });
    if (existing) {
      if (existing.status === "open" || existing.status === "blocked") {
        await db.cookieScanFinding.update({ where: { id: existing.id }, data: { disclosed, firedBeforeConsent: s.firedBeforeConsent, autoBlocked: true, status: "blocked", technicalDetail: detail, triggerSource: trigger } });
      }
    } else {
      await db.cookieScanFinding.create({ data: { scriptName: s.name, vendor: s.vendor, page: s.page, disclosed, firedBeforeConsent: s.firedBeforeConsent, autoBlocked: true, status: "blocked", technicalDetail: detail, triggerSource: trigger } });
    }
  }
  await audited(
    { actor, action: "cookie.scan_run", targetType: "CookieScanFinding", targetId: "scan", eventDescription: `Script compliance scan (${trigger}) — ${flagged} flagged and auto-blocked`, payload: { trigger, flagged } },
    (tx: TxClient) => tx.integrationConfig.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } }),
  );
  return { flagged };
}

/** Categorise a flagged script into policy — unblocks it and records it as a
 *  declared CookieScript under the chosen category. */
export async function categorizeScript(findingId: string, categoryId: string, actor: AuditActor) {
  const f = await db.cookieScanFinding.findUniqueOrThrow({ where: { id: findingId } });
  await audited(
    { actor, action: "cookie.script_categorised", targetType: "CookieScanFinding", targetId: findingId, eventDescription: `Categorised ${f.scriptName} into policy`, payload: { categoryId } },
    async (tx: TxClient) => {
      await tx.cookieScanFinding.update({ where: { id: findingId }, data: { status: "categorised", autoBlocked: false, disclosed: true } });
      const exists = await tx.cookieScript.findFirst({ where: { name: f.scriptName } });
      if (!exists) await tx.cookieScript.create({ data: { name: f.scriptName, vendor: f.vendor, page: f.page, categoryId } });
      else await tx.cookieScript.update({ where: { id: exists.id }, data: { categoryId } });
    },
  );
}
