import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { isCombinedGovernance } from "@/lib/governance";
import { isLargeSource, SUGGESTED_OFF_PEAK } from "@/lib/scenario4";
import type { TxClient } from "@/lib/tx";

/** SCENARIO 4 ENGINE — scan scheduling, classification override (with reason
 *  category), quarantine + share-approval, integration schema validation, and
 *  the identity-resolution run. Reuses discovery models; never re-models them. */

async function governance() {
  return db.discoveryGovernance.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
}
export async function getDiscoveryGovernance() {
  const g = await governance();
  let ciso: string[] = [];
  try { ciso = JSON.parse(g.cisoApprovedFieldsJson); } catch { ciso = []; }
  return { identityMatchThreshold: g.identityMatchThreshold, cisoApprovedFields: Array.isArray(ciso) ? ciso : [] };
}

// ---- SCREEN 1: Scan configuration & scheduling ----------------------------

/** Schedule scans on APPROVED sources only (enforced server-side). Large
 *  sources get the off-peak window if one isn't set. */
export async function scheduleScan(sourceIds: string[], schedule: string, offPeakWindow: string | null, actor: AuditActor) {
  const sources = await db.discoverySource.findMany({ where: { id: { in: sourceIds } } });
  const unapproved = sources.filter((s) => !s.dpoApprovedForScanning);
  if (unapproved.length) throw Object.assign(new Error("A scan can only be scheduled on DPO-approved sources."), { name: "UnauthorisedScopeError" });
  await audited(
    { actor, action: "discovery.scan_scheduled", targetType: "DiscoverySource", targetId: sourceIds[0] ?? "", eventDescription: `Scheduled ${schedule} scan on ${sources.length} approved source(s)`, payload: { schedule, count: sources.length } },
    async (tx: TxClient) => {
      for (const s of sources) {
        const window = isLargeSource(s.kind, s.estimatedDurationMinutes) ? (offPeakWindow || s.offPeakWindow || SUGGESTED_OFF_PEAK) : offPeakWindow;
        await tx.discoverySource.update({ where: { id: s.id }, data: { scanSchedule: schedule, offPeakWindow: window } });
      }
    },
  );
}

// ---- SCREEN 3: Classification override with reason category ----------------

const HIGH_RISK_TYPES = ["pan", "aadhaar", "financial", "kyc", "health", "card", "biometric"];

export async function overrideClassification(fieldId: string, newType: string, category: string, note: string, actor: AuditActor) {
  if (!["mis_tagged", "reclassified", "other"].includes(category)) throw Object.assign(new Error("Pick a reason category."), { name: "ValidationError" });
  if (!note.trim()) throw Object.assign(new Error("A note is required alongside the category."), { name: "ValidationError" });
  const field = await db.classifiedField.findUniqueOrThrow({ where: { id: fieldId }, include: { source: true } });
  // Reclassifying a field TO a high-risk type flags it high-risk, which auto-
  // quarantines it — isolation follows the flag, never a manual step.
  const nowHighRisk = HIGH_RISK_TYPES.includes(newType.trim().toLowerCase());
  await audited(
    { actor, action: "discovery.classification_overridden", targetType: "ClassifiedField", targetId: fieldId, eventDescription: `Reclassified ${field.fieldPath} → ${newType} (${category})`, payload: { detectedType: field.detectedType, overriddenTo: newType, category, note, wasHighConfidence: field.confidence === "high" } },
    (tx: TxClient) => tx.classifiedField.update({ where: { id: fieldId }, data: { reviewState: "overridden", overriddenType: newType, overrideReason: note.trim(), overrideReasonCategory: category, highConfidenceOverride: field.confidence === "high", reviewedByActorId: actor.id ?? null, reviewedAt: new Date(), ...(nowHighRisk ? { sensitivityTier: "high", quarantined: true } : {}) } }),
  );
}

// ---- SCREEN 2: bulk-onboard newly discovered sources ----------------------

export async function bulkOnboardSources(sourceIds: string[], actor: AuditActor) {
  if (sourceIds.length === 0) throw Object.assign(new Error("Select at least one source to onboard."), { name: "ValidationError" });
  await audited(
    { actor, action: "discovery.sources_onboarded", targetType: "DiscoverySource", targetId: sourceIds[0], eventDescription: `Onboarded ${sourceIds.length} newly discovered source(s) into the inventory`, payload: { count: sourceIds.length } },
    (tx: TxClient) => tx.discoverySource.updateMany({ where: { id: { in: sourceIds } }, data: { availableAsScanTarget: true, connectionState: "connected" } }),
  );
}

// ---- SCREEN 4: quarantine + share-approval gate ---------------------------

export async function quarantineField(fieldId: string, actor: AuditActor) {
  const field = await db.classifiedField.findUniqueOrThrow({ where: { id: fieldId } });
  await audited(
    { actor, action: "discovery.quarantined", targetType: "ClassifiedField", targetId: fieldId, eventDescription: `Quarantined high-risk finding ${field.fieldPath}`, payload: {} },
    (tx: TxClient) => tx.classifiedField.update({ where: { id: fieldId }, data: { quarantined: true } }),
  );
}

/** Sharing a quarantined finding is replaced by an approval request routed to
 *  the DPO (combined governance) or CISO. */
export async function requestShareApproval(fieldId: string, actor: AuditActor) {
  const field = await db.classifiedField.findUniqueOrThrow({ where: { id: fieldId }, include: { shareApprovals: { where: { status: "pending" } } } });
  if (!field.quarantined) throw Object.assign(new Error("Only a quarantined finding needs share approval."), { name: "StateError" });
  if (field.shareApprovals.length) throw Object.assign(new Error("A share-approval request is already pending."), { name: "StateError" });
  const combined = await isCombinedGovernance();
  const approverRole = combined ? "dpo" : "ciso";
  const req = await audited(
    { actor, action: "discovery.share_requested", targetType: "ClassifiedField", targetId: fieldId, eventDescription: `Requested approval to share quarantined ${field.fieldPath}`, payload: { approverRole } },
    (tx: TxClient) => tx.shareApprovalRequest.create({ data: { fieldId, approverRole, requestedBy: actor.label } }),
  );
  await emit(db, { kind: "discovery.share_approval_needed", requestId: req.id, approverRole: approverRole as "dpo" | "ciso", fieldPath: field.fieldPath });
  return req;
}

export async function decideShareApproval(requestId: string, approve: boolean, note: string, actor: AuditActor) {
  const req = await db.shareApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (actor.role !== req.approverRole) throw Object.assign(new Error(`Only the ${req.approverRole.toUpperCase()} can decide this request. Switch role to decide.`), { name: "UnauthorisedRulingError" });
  await audited(
    { actor, action: approve ? "discovery.share_approved" : "discovery.share_denied", targetType: "ShareApprovalRequest", targetId: requestId, eventDescription: `${approve ? "Approved" : "Denied"} share of a quarantined finding`, payload: { note } },
    (tx: TxClient) => tx.shareApprovalRequest.update({ where: { id: requestId }, data: { status: approve ? "approved" : "denied", decidedBy: actor.label, decidedAt: new Date(), decisionNote: note.trim() || null } }),
  );
}

// ---- SCREEN 5: integration setup + drift monitoring -----------------------

export interface FieldMap { target: string; source: string }

export async function saveIntegration(input: { id?: string; name: string; vendor: string; syncFrequency: string; mapping: FieldMap[]; monitoringEnabled: boolean; connect: boolean }, actor: AuditActor) {
  const { cisoApprovedFields } = await getDiscoveryGovernance();
  const approved = new Set(cisoApprovedFields);
  const validated = input.mapping.filter((m) => m.target.trim() || m.source.trim()).map((m) => ({ ...m, valid: approved.has(m.target.trim()) }));
  const invalid = validated.filter((m) => !m.valid);
  if (input.connect && invalid.length) {
    throw Object.assign(new Error(`Save blocked: ${invalid.length} mapping(s) target a field outside the CISO-approved schema (${invalid.map((m) => m.target).join(", ")}).`), { name: "SchemaValidationError" });
  }
  return audited(
    { actor, action: input.connect ? "integration.connected" : "integration.saved", targetType: "IntegrationConnection", targetId: input.id ?? input.name, eventDescription: `${input.connect ? "Connected" : "Saved"} integration ${input.name} with drift monitoring ${input.monitoringEnabled ? "on" : "off"}`, payload: { vendor: input.vendor, monitoring: input.monitoringEnabled } },
    async (tx: TxClient) => {
      const data = { name: input.name.trim(), vendor: input.vendor.trim(), syncFrequency: input.syncFrequency, fieldMappingJson: JSON.stringify(validated), monitoringEnabled: input.monitoringEnabled, status: input.connect ? "connected" : "draft", connectedAt: input.connect ? new Date() : null };
      if (input.id) return tx.integrationConnection.update({ where: { id: input.id }, data });
      return tx.integrationConnection.create({ data });
    },
  );
}

// ---- SCREEN 6: identity resolution run ------------------------------------

/** Run matching at the DPO-approved threshold. Flags the unresolved near-
 *  duplicate pairs above threshold, attaching a match reason to each. */
export async function runIdentityResolution(actor: AuditActor) {
  const { identityMatchThreshold } = await getDiscoveryGovernance();
  const run = await db.identityResolutionRun.create({ data: { threshold: identityMatchThreshold, status: "running", runBy: actor.label } });

  const pairs = await db.duplicatePair.findMany({ where: { resolution: "unresolved" }, include: { fieldA: true, fieldB: true } });
  let flagged = 0;
  for (const p of pairs) {
    if (p.similarityScore < identityMatchThreshold) continue;
    flagged += 1;
    if (!p.matchReason) {
      const same = p.fieldA.detectedType === p.fieldB.detectedType ? `${p.fieldA.detectedType} (exact)` : `${p.fieldA.detectedType}/${p.fieldB.detectedType}`;
      await db.duplicatePair.update({ where: { id: p.id }, data: { matchReason: `Matched on: ${same}; field name ${p.similarityScore}% similarity` } });
    }
  }

  await audited(
    { actor, action: "discovery.identity_resolution_run", targetType: "IdentityResolutionRun", targetId: run.id, eventDescription: `Ran identity resolution at ${identityMatchThreshold}% — ${flagged} pair(s) flagged`, payload: { threshold: identityMatchThreshold, flagged } },
    (tx: TxClient) => tx.identityResolutionRun.update({ where: { id: run.id }, data: { status: "complete", completedAt: new Date(), pairsFlagged: flagged } }),
  );
  return { flagged, threshold: identityMatchThreshold };
}
