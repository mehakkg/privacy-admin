import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { VendorPortal } from "@/components/vendorPortal";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2.3 — Vendor Self-Service Assessment Portal. In production this is a
 * scoped guest surface the vendor logs into; here it renders inside the shell
 * for the demo, but it is a SEPARATE route from the review screen and shows the
 * vendor nothing about its own classification.
 */
export default async function RespondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.vendorAssessment.findUnique({ where: { id }, include: { vendor: true } });
  if (!a) notFound();

  const responses: Record<string, string> = (() => { try { return JSON.parse(a.responseJson || "{}"); } catch { return {}; } })();

  return (
    <Shell active="/vendor-risk/assessments" title={`Assessment / ${a.vendor.name} — vendor portal`}>
      <PageHead
        title="Vendor assessment"
        titleTip="The vendor's own view: answer the questionnaire, save and resume, then submit. It never shows the vendor its risk classification or the reviewer's notes."
      />
      <div style={{ marginBottom: 12 }}>
        <Notice tone="info" title="Vendor-facing view">
          This is the external, submission-only portal. Legal&rsquo;s classification and notes live on a separate screen the vendor cannot see.
        </Notice>
      </div>
      <VendorPortal
        assessmentId={id}
        initialResponses={responses}
        submitted={a.vendorStatus === "submitted"}
        templateName={a.templateName}
        vendorName={a.vendor.name}
      />
    </Shell>
  );
}
