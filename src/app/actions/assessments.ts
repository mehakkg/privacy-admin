"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import { baselineForCategory } from "@/lib/tprm";
import type { ActionResult } from "@/app/actions/requests";

const RATINGS = new Set(["low", "medium", "high", "critical"]);

function ok(paths: string[]): ActionResult { paths.forEach((p) => revalidatePath(p, "layout")); return { ok: true }; }
function fail(error: string, kind = "ValidationError"): ActionResult { return { ok: false, error, errorKind: kind }; }

export interface AssignInput {
  vendorId?: string | null;
  newVendorName?: string | null;
  category?: string | null;
  baselineRating: string;
  templateName: string;
}

/**
 * Assign a questionnaire — the intake that also creates a vendor's register
 * entry when the vendor is new. The captured baseline is the system suggestion;
 * the vendor's register rating is left AT that baseline until Legal finalizes a
 * real classification (never silently promoted from baseline to final).
 */
export async function assignQuestionnaireAction(input: AssignInput): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.templateName) return fail("Pick a questionnaire template.");
  if (!input.vendorId && !input.newVendorName?.trim()) return fail("Select an existing vendor or name a new one.");
  const baseline = RATINGS.has(input.baselineRating) ? input.baselineRating : "medium";
  try {
    await audited(
      { actor, action: "vendor.questionnaire_assigned", targetType: "Vendor", targetId: input.vendorId ?? input.newVendorName ?? "new", payload: { templateName: input.templateName, baseline } },
      async (tx: TxClient) => {
        let vendorId = input.vendorId ?? null;
        if (!vendorId) {
          const category = input.category?.trim() || "Uncategorized";
          const v = await tx.vendor.create({
            data: { name: input.newVendorName!.trim(), category, riskRating: baseline, riskBaseline: baseline, ownerName: actor.label, onboardedAt: new Date(), dpaStatus: "not_on_file" },
          });
          vendorId = v.id;
        }
        return tx.vendorAssessment.create({
          data: { vendorId, templateName: input.templateName, baselineRating: baseline, vendorStatus: "not_started", legalReviewStatus: "pending" },
        });
      },
    );
    return ok(["/vendor-risk/assessments", "/vendor-risk/register"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Vendor portal: save answers (resume-able), and optionally submit. On submit
 *  the response locks and Legal's review moves to "partial". */
export async function saveAssessmentResponseAction(
  assessmentId: string,
  responses: Record<string, string>,
  submit: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: submit ? "vendor.assessment_submitted" : "vendor.assessment_saved", targetType: "VendorAssessment", targetId: assessmentId, payload: { submit } },
      (tx: TxClient) =>
        tx.vendorAssessment.update({
          where: { id: assessmentId },
          data: {
            responseJson: JSON.stringify(responses),
            vendorStatus: submit ? "submitted" : "in_progress",
            submittedAt: submit ? new Date() : null,
            legalReviewStatus: submit ? "partial" : "pending",
          },
        }),
    );
    return ok([`/vendor-risk/assessments/${assessmentId}`, `/vendor-risk/assessments/${assessmentId}/respond`, "/vendor-risk/assessments"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Legal reopens a submitted assessment so the vendor can edit again. */
export async function reopenAssessmentAction(assessmentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "vendor.assessment_reopened", targetType: "VendorAssessment", targetId: assessmentId, payload: {} },
      (tx: TxClient) => tx.vendorAssessment.update({ where: { id: assessmentId }, data: { vendorStatus: "in_progress", legalReviewStatus: "pending", submittedAt: null } }),
    );
    return ok([`/vendor-risk/assessments/${assessmentId}`, "/vendor-risk/assessments"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/**
 * Legal sets the FINAL classification. A human owns the rating: the reason is
 * required, the review goes to "verified", and the classification is written
 * back to the Vendor register (with an override-history entry if it changed the
 * rating), so the register's "reviewed" state is real, not asserted.
 */
export async function finalizeClassificationAction(
  assessmentId: string,
  classification: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!RATINGS.has(classification)) return fail("Pick a classification.");
  if (!reason.trim()) return fail("A reason is required — a human owns this rating.");
  try {
    await audited(
      { actor, action: "vendor.assessment_classified", targetType: "VendorAssessment", targetId: assessmentId, payload: { classification, reason: reason.trim() } },
      async (tx: TxClient) => {
        const a = await tx.vendorAssessment.findUniqueOrThrow({ where: { id: assessmentId }, include: { vendor: true } });
        await tx.vendorAssessment.update({
          where: { id: assessmentId },
          data: { classification, classificationReason: reason.trim(), legalReviewStatus: "verified" },
        });
        // Write back to the register.
        const data: Record<string, unknown> = { riskRating: classification, lastReviewedAt: new Date() };
        if (a.vendor.riskRating !== classification) {
          const history = JSON.parse(a.vendor.riskOverrideHistoryJson || "[]");
          history.unshift({ from: a.vendor.riskRating, to: classification, by: actor.label, reason: `Assessment classification: ${reason.trim()}`, at: new Date().toISOString() });
          data.riskOverrideHistoryJson = JSON.stringify(history);
        }
        return tx.vendor.update({ where: { id: a.vendorId }, data });
      },
    );
    return ok([`/vendor-risk/assessments/${assessmentId}`, "/vendor-risk/assessments", "/vendor-risk/register"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}
