"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const QUEUE = "/vendor-risk/sub-processor-disclosures";
const APPROVERS = new Set(["legal", "dpo"]);

function ok(paths: string[]): ActionResult { paths.forEach((p) => revalidatePath(p, "layout")); return { ok: true }; }
function fail(error: string, kind = "ValidationError"): ActionResult { return { ok: false, error, errorKind: kind }; }

export interface DocInput { name: string; docType: string; expiresAt?: string | null }

/**
 * Register a disclosure and submit it for approval. Compliance documentation is
 * REQUIRED — the flow cannot reach submission without at least one document —
 * and submitting lands the disclosure in `held_pending_approval`: a genuine
 * block. Note there is no path here (or anywhere processor-facing) to `active`;
 * only approveDisclosureAction can lift the hold.
 */
export async function submitDisclosureAction(
  primaryVendorId: string,
  fields: { subProcessorName: string; reason: string; scope: string; piiTypes: string[] },
  docs: DocInput[],
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!primaryVendorId) return fail("Select the primary vendor.");
  if (!fields.subProcessorName.trim()) return fail("Name the sub-processor.");
  if (!fields.scope.trim()) return fail("Describe what the sub-processor will do.");
  if (!fields.piiTypes.length) return fail("Select the PII types the sub-processor will touch.");
  if (!docs.length) return fail("Attach at least one compliance document before submitting.");
  try {
    await audited(
      { actor, action: "subprocessor.disclosure_submitted", targetType: "SubProcessorDisclosure", targetId: fields.subProcessorName.trim(), payload: { primaryVendorId, ...fields } },
      async (tx: TxClient) => {
        const disc = await tx.subProcessorDisclosure.create({
          data: {
            primaryVendorId,
            subProcessorName: fields.subProcessorName.trim(),
            reason: fields.reason.trim() || null,
            scope: fields.scope.trim(),
            piiTypesJson: JSON.stringify(fields.piiTypes),
            status: "held_pending_approval",
            disclosedAt: new Date(),
          },
        });
        for (const doc of docs) {
          await tx.subProcessorDocument.create({
            data: { vendorId: primaryVendorId, disclosureId: disc.id, name: doc.name.trim() || "Document", docType: doc.docType, expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : null },
          });
        }
        return disc;
      },
    );
    return ok([QUEUE]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** The ONLY path to Active — Legal/DPO only. Lifting the hold is the gate. */
export async function approveDisclosureAction(id: string): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (!APPROVERS.has(role)) return fail("Only Legal or the DPO can approve a sub-processor engagement.", "ForbiddenError");
  try {
    await audited(
      { actor, action: "subprocessor.approved", targetType: "SubProcessorDisclosure", targetId: id, payload: {} },
      async (tx: TxClient) => {
        const d = await tx.subProcessorDisclosure.findUniqueOrThrow({ where: { id } });
        if (d.status !== "held_pending_approval") throw Object.assign(new Error("Only a held disclosure can be approved."), { name: "StateError" });
        return tx.subProcessorDisclosure.update({ where: { id }, data: { status: "active", approvedAt: new Date(), approvedBy: actor.label } });
      },
    );
    return ok([QUEUE]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Reject a held disclosure — a reason is required, sent back to the processor. */
export async function rejectDisclosureAction(id: string, reason: string): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (!APPROVERS.has(role)) return fail("Only Legal or the DPO can reject.", "ForbiddenError");
  if (!reason.trim()) return fail("A reason is required to reject.");
  try {
    await audited(
      { actor, action: "subprocessor.rejected", targetType: "SubProcessorDisclosure", targetId: id, payload: { reason: reason.trim() } },
      (tx: TxClient) => tx.subProcessorDisclosure.update({ where: { id }, data: { status: "pending_disclosure", rejectedReason: reason.trim() } }),
    );
    return ok([QUEUE]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Screen 3.5 — route a flagged undisclosed transfer into Legal's queue. Reuses
 *  the platform's Escalation object rather than a new queue surface. */
export async function routeFlaggedToLegalAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "subprocessor.flag_routed_to_legal", targetType: "SubProcessorDisclosure", targetId: id, payload: {} },
      async (tx: TxClient) => {
        const d = await tx.subProcessorDisclosure.findUniqueOrThrow({ where: { id }, include: { primaryVendor: true } });
        await tx.escalation.create({
          data: {
            type: "dpa_check", sourceRole: "dpo", targetRole: "legal",
            reason: `Undisclosed transfer from ${d.primaryVendor.name} — check DPA coverage for ${d.subProcessorName}`,
            contextJson: JSON.stringify({ disclosureId: id, vendor: d.primaryVendor.name, suspected: d.subProcessorName }),
          },
        });
        return tx.subProcessorDisclosure.update({ where: { id }, data: { flagStatus: "routed_to_legal" } });
      },
    );
    return ok([QUEUE, "/vendor-risk/sub-processor-disclosures/flagged", "/escalations"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Resolve a flagged transfer as covered by an existing DPA (closes the flag). */
export async function resolveFlaggedAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "subprocessor.flag_resolved", targetType: "SubProcessorDisclosure", targetId: id, payload: {} },
      (tx: TxClient) => tx.subProcessorDisclosure.update({ where: { id }, data: { flagStatus: "resolved" } }),
    );
    return ok([QUEUE, "/vendor-risk/sub-processor-disclosures/flagged"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Add a compliance document to a vendor's standing Evidence Package Store. */
export async function addEvidenceDocAction(vendorId: string, name: string, docType: string, expiresAt: string | null): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) return fail("Name the document.");
  try {
    await audited(
      { actor, action: "subprocessor.evidence_added", targetType: "Vendor", targetId: vendorId, payload: { name: name.trim(), docType } },
      (tx: TxClient) => tx.subProcessorDocument.create({ data: { vendorId, name: name.trim(), docType, expiresAt: expiresAt ? new Date(expiresAt) : null } }),
    );
    return ok(["/vendor-risk/evidence-store"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}
