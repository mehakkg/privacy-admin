import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/risk/assessments" title={"Assessments"}>
      <Placeholder
        title={"Assessments"}
        tip={"Admin-side assessments. DPIA is a DPO-exclusive Governance Portal function, excluded here."}
        what={
          <>
            <strong>Vendor assessments</strong> — the assessment of processors and vendors
            Admin is responsible for. DPIA is deliberately excluded: it is a DPO-exclusive
            function of the Governance Portal, not an Admin surface.
          </>
        }
      />
    </Shell>
  );
}
