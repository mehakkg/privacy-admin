import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/vendor-risk/register" title={"Vendor Risk / Vendor register"}>
      <Placeholder
        title={"Vendor register"}
        tip={"Third Party Vendor Risk Management (TPRM) — the central registry of vendors and what they touch."}
        what={
          <>
            The central vendor database, vendor-to-purpose / PII mapping, and baseline
            risk-rating lookup. The system of record the assessment and disclosure tabs
            build on.
          </>
        }
      />
    </Shell>
  );
}
