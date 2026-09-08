import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/vendor-risk/assessments" title={"Vendor Risk / Assessments"}>
      <Placeholder
        title={"Assessments"}
        tip={"Vendor questionnaires and risk classification — the TPRM assessment workflow."}
        what={
          <>
            Questionnaire assignment and templates, a vendor self-service portal for
            responses, and risk-classification review. This is the TPRM vendor-assessment
            workflow, distinct from Risk &amp; Compliance&rsquo;s own Assessments tab.
          </>
        }
      />
    </Shell>
  );
}
