import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { runScriptComplianceScan } from "@/lib/engines/scenario6";
import { computeNextRun } from "@/lib/cookieCompliance";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 9 ENGINE — cookie-compliance scheduling, scheduled scan trigger, and
 * cookie-policy-version re-consent. Reuses the Scenario-5 script-compliance
 * engine and the Scenario-8 re-consent path (ConsentExpiryLog); adds only the
 * cadence config and the policy-version trigger.
 */

function err(name: string, message: string) { return Object.assign(new Error(message), { name }); }

// ---- Screen 1: scan schedule ----------------------------------------------

export async function setScanCadence(cadence: "on_demand" | "monthly", actor: AuditActor) {
  if (!["on_demand", "monthly"].includes(cadence)) throw err("ValidationError", "Invalid cadence.");
  const nextRunAt = computeNextRun(cadence);
  return audited(
    { actor, action: "cookie.scan_scheduled", targetType: "CookieScanSchedule", targetId: "cookie", eventDescription: `Set cookie scan cadence to ${cadence}`, payload: { cadence } },
    (tx: TxClient) => tx.cookieScanSchedule.upsert({ where: { id: "cookie" }, create: { id: "cookie", cadence, nextRunAt, updatedBy: actor.label }, update: { cadence, nextRunAt, updatedBy: actor.label } }),
  );
}

/** Simulate the scheduled monitor firing: it calls the SAME script-compliance
 *  engine as the manual trigger, with trigger_source = scheduled. */
export async function runScheduledScan(actor: AuditActor) {
  const r = await runScriptComplianceScan(actor, "scheduled");
  const now = new Date();
  const sched = await db.cookieScanSchedule.findUnique({ where: { id: "cookie" } });
  await db.cookieScanSchedule.upsert({
    where: { id: "cookie" },
    create: { id: "cookie", cadence: "monthly", lastRunAt: now, nextRunAt: computeNextRun("monthly", now), updatedBy: actor.label },
    update: { lastRunAt: now, nextRunAt: computeNextRun(sched?.cadence ?? "monthly", now) },
  });
  return r;
}

// ---- Screen 7: reconsent on cookie-policy-version publish ------------------

/** Publish a new cookie-policy version. This is a SECOND re-consent trigger:
 *  returning visitors with granted consent are flagged for re-prompting under the
 *  new policy (logged as a batch), never silently continued. Reuses the
 *  Scenario-8 ConsentExpiryLog reconsent path; no record is deleted. */
export async function publishCookiePolicyVersion(version: string, summary: string, actor: AuditActor) {
  if (!version.trim()) throw err("ValidationError", "Give the new policy a version label.");
  // Returning visitors = existing granted consent records.
  const affected = await db.consentRecord.findMany({ where: { status: "granted" }, select: { id: true, purposeTag: { select: { name: true } } }, take: 500 });
  return audited(
    { actor, action: "cookie.policy_published", targetType: "CookiePolicyVersion", targetId: version.trim(), eventDescription: `Published cookie policy ${version.trim()} → re-consent triggered for ${affected.length} visitor(s)`, payload: { version, affected: affected.length } },
    async (tx: TxClient) => {
      const rec = await tx.cookiePolicyVersion.create({ data: { version: version.trim(), summary: summary.trim() || null, publishedBy: actor.label, reconsentTriggered: true, affectedCount: affected.length } });
      for (const c of affected) {
        await tx.consentExpiryLog.create({ data: { consentRecordId: c.id, purposeName: c.purposeTag?.name ?? null, action: "reconsent_policy_change", detail: `Cookie policy ${version.trim()} published — returning visitor re-prompted under the new policy (consent preserved as history).` } });
      }
      return rec;
    },
  );
}
