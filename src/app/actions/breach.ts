"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { isCombinedGovernance } from "@/lib/governance";
import { breachSeverity } from "@/lib/breach";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const LIST = "/breach/incidents";
function paths(id?: string) { return [LIST, "/breach/trends", ...(id ? [`/breach/incidents/${id}`] : [])]; }
function run(op: () => Promise<unknown>, id?: string): Promise<ActionResult> {
  return (async () => {
    try { await op(); for (const p of paths(id)) revalidatePath(p, "layout"); return { ok: true }; }
    catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
  })();
}

export interface ReportBreachInput {
  reportedVia: "internal" | "public_self_service";
  category?: string;
  reporterNote: string;
  volume: number;
  piiType: string;
  sensitivity: string;
  entityId?: string | null;
}

/** Intake (internal OR public self-service). Auto-computes severity and starts
 *  the incident in triage, immediately visible to the CISO. */
export async function reportBreachAction(input: ReportBreachInput): Promise<ActionResult> {
  // The public channel is unauthenticated — no session actor is needed to file.
  if (!input.reporterNote.trim()) return { ok: false, error: "Describe what happened.", errorKind: "ValidationError" };
  const sev = breachSeverity({ volume: Number(input.volume) || 0, piiType: input.piiType, sensitivity: input.sensitivity });
  try {
    const ref = `BR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const incident = await db.$transaction(async (tx) => {
      const inc = await tx.breachIncident.create({
        data: {
          reference: ref, reportedVia: input.reportedVia, category: input.category?.trim() || null,
          severity: sev.severity, severityBasisJson: JSON.stringify({ ...sev.basis, score: sev.score, volume: input.volume, piiType: input.piiType, sensitivity: input.sensitivity }),
          status: "triage", entityId: input.entityId || null, reporterNote: input.reporterNote.trim(),
        },
      });
      // 72-hour clock starts here — surfaced via the breach_clock notification category.
      await emit(tx, { kind: "breach.detected", incidentId: inc.id, reference: ref, severity: sev.severity });
      return inc;
    });
    for (const p of paths(incident.id)) revalidatePath(p, "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

export async function triageIncidentAction(id: string, category: string, owner: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.triaged", targetType: "BreachIncident", targetId: id, payload: { category, owner } },
    (tx: TxClient) => tx.breachIncident.update({ where: { id }, data: { category: category.trim() || null, owner: owner.trim() || actor.label, status: "investigating" } }),
  ), id);
}

export async function addImpactAction(id: string, elementName: string, purposeId: string | null, processorId: string | null): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!elementName.trim()) return { ok: false, error: "Pick or name an element.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "breach.impact_added", targetType: "BreachIncident", targetId: id, payload: { elementName, processorId } },
    async (tx: TxClient) => {
      await tx.incidentImpactMapping.create({ data: { incidentId: id, elementName: elementName.trim(), purposeId: purposeId || null, processorId: processorId || null } });
      if (processorId) await tx.breachIncident.update({ where: { id }, data: { isProcessorCaused: true } });
    },
  ), id);
}

export async function removeImpactAction(mappingId: string, incidentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.impact_removed", targetType: "IncidentImpactMapping", targetId: mappingId, payload: {} },
    (tx: TxClient) => tx.incidentImpactMapping.delete({ where: { id: mappingId } }),
  ), incidentId);
}

/** Snapshot the affected cohort — immutable once taken, even if the underlying
 *  Data Principal records change later. */
export async function identifyCohortAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.cohort_identified", targetType: "BreachIncident", targetId: id, payload: {} },
    async (tx: TxClient) => {
      const principals = await tx.dataPrincipal.findMany({ take: 500, select: { id: true } });
      const ids = principals.map((p) => p.id);
      return tx.affectedPrincipalCohort.create({ data: { incidentId: id, principalIdsJson: JSON.stringify(ids), count: ids.length } });
    },
  ), id);
}

export async function sendProcessorOutreachAction(id: string, processorId: string, processorName: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.processor_outreach", targetType: "BreachIncident", targetId: id, payload: { processorId } },
    (tx: TxClient) => tx.processorBreachThread.create({ data: { incidentId: id, processorId, processorName, outreachSentAt: new Date() } }),
  ), id);
}

export async function recordProcessorResponseAction(threadId: string, response: string, incidentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!response.trim()) return { ok: false, error: "Enter the processor's response.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "breach.processor_response", targetType: "ProcessorBreachThread", targetId: threadId, payload: {} },
    (tx: TxClient) => tx.processorBreachThread.update({ where: { id: threadId }, data: { remediationResponse: response.trim(), responseReceivedAt: new Date() } }),
  ), incidentId);
}

/** Explicit fiduciary confirmation — a distinct action; a response does not
 *  auto-confirm remediation. */
export async function confirmFiduciaryAction(threadId: string, incidentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.fiduciary_confirmed", targetType: "ProcessorBreachThread", targetId: threadId, payload: {} },
    (tx: TxClient) => tx.processorBreachThread.update({ where: { id: threadId }, data: { fiduciaryConfirmed: true, confirmedAt: new Date(), confirmedBy: actor.label } }),
  ), incidentId);
}

export async function sendImmediateDescriptionAction(id: string, text: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!text.trim()) return { ok: false, error: "Enter the immediate description.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "breach.immediate_sent", targetType: "BreachIncident", targetId: id, payload: {} },
    (tx: TxClient) => tx.boardNotificationPackage.upsert({
      where: { incidentId: id },
      update: { immediateDescription: text.trim(), immediateSentAt: new Date() },
      create: { incidentId: id, immediateDescription: text.trim(), immediateSentAt: new Date(), compiledBy: actor.label },
    }),
  ), id);
}

/** Save the six-field package (CISO compiles). Never collapses fields. */
export async function saveBoardPackageAction(id: string, fields: Record<string, string>): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.package_saved", targetType: "BreachIncident", targetId: id, payload: {} },
    async (tx: TxClient) => {
      const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() || null]));
      await tx.boardNotificationPackage.upsert({
        where: { incidentId: id },
        update: { ...data, compiledBy: actor.label },
        create: { incidentId: id, ...data, compiledBy: actor.label },
      });
      await tx.breachIncident.update({ where: { id }, data: { status: "package_compiling" } });
    },
  ), id);
}

/** DPO submits (author/approve segregation). Refused unless all six fields are
 *  present. Self-approval is logged under combined governance — no exception. */
export async function submitBoardPackageAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const combined = await isCombinedGovernance();
  const allowed = actor.role === "dpo" || actor.role === "ciso" || (combined && actor.role === "admin");
  if (!allowed) return { ok: false, error: "Only the DPO/CISO can submit the Board package. Switch role to submit.", errorKind: "UnauthorisedRulingError" };
  return run(() => audited(
    { actor, action: "breach.package_submitted", targetType: "BreachIncident", targetId: id, payload: { selfApproved: combined } },
    async (tx: TxClient) => {
      const pkg = await tx.boardNotificationPackage.findUniqueOrThrow({ where: { incidentId: id } });
      const missing = ["updatedDescription", "factsAndCircumstances", "mitigationMeasures", "causeFindings", "remedialMeasures", "principalIntimationReport"].filter((k) => !(pkg as Record<string, unknown>)[k]);
      if (missing.length) throw Object.assign(new Error(`All six Rule 8(6)(b) fields are required before submission — ${missing.length} still empty.`), { name: "ValidationError" });
      if (pkg.submittedAt) throw Object.assign(new Error("This package has already been submitted and is immutable."), { name: "StateError" });
      await tx.boardNotificationPackage.update({ where: { incidentId: id }, data: { approvedBy: actor.label, submittedAt: new Date(), selfApproved: combined } });
      await tx.breachIncident.update({ where: { id }, data: { status: "board_notified" } });
    },
  ), id);
}

export async function addRemediationTaskAction(id: string, title: string, team: string, assignedTo: string, dueDate: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!title.trim()) return { ok: false, error: "Name the task.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "breach.task_added", targetType: "BreachIncident", targetId: id, payload: { team } },
    async (tx: TxClient) => {
      await tx.remediationTask.create({ data: { incidentId: id, title: title.trim(), team, assignedTo: assignedTo.trim() || null, dueDate: dueDate ? new Date(dueDate) : null } });
      await tx.breachIncident.update({ where: { id }, data: { status: "remediation" } });
    },
  ), id);
}

export async function setTaskStatusAction(taskId: string, status: string, incidentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.task_status", targetType: "RemediationTask", targetId: taskId, payload: { status } },
    (tx: TxClient) => tx.remediationTask.update({ where: { id: taskId }, data: { status } }),
  ), incidentId);
}

/** Close — refused while any remediation task is still open. */
export async function closeIncidentAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => audited(
    { actor, action: "breach.closed", targetType: "BreachIncident", targetId: id, payload: {} },
    async (tx: TxClient) => {
      const openTasks = await tx.remediationTask.count({ where: { incidentId: id, status: { not: "done" } } });
      if (openTasks > 0) throw Object.assign(new Error(`${openTasks} remediation task${openTasks === 1 ? "" : "s"} still open — an incident can't be closed with open tasks.`), { name: "StateError" });
      return tx.breachIncident.update({ where: { id }, data: { status: "closed" } });
    },
  ), id);
}
