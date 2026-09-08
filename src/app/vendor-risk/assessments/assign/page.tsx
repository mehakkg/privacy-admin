import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { AssignWizard } from "@/components/assignWizard";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const vendors = await db.vendor.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, riskBaseline: true },
  });

  return (
    <Shell active="/vendor-risk/assessments" title="Vendor Risk / Assign questionnaire">
      <PageHead
        crumbs={[{ label: "Assessments", href: "/vendor-risk/assessments" }, { label: "Assign questionnaire" }]}
        title="Assign a vendor questionnaire"
        titleTip="Pick a vendor, confirm the system's baseline suggestion, choose a template scoped to that risk tier, and send. New vendors are created into the register by this flow."
      />
      <AssignWizard vendors={vendors.map((v) => ({ id: v.id, name: v.name, category: v.category, baseline: v.riskBaseline }))} />
    </Shell>
  );
}
