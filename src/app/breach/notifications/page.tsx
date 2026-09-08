import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/breach/notifications" title={"Breach Management / Notifications & Board reporting"}>
      <Placeholder
        title={"Notifications & Board reporting"}
        tip={"The statutory output: notifying affected principals and the Data Protection Board within the deadline."}
        what={
          <>
            DPIA / consent-record linkage, the complete package handoff to the DPO, and
            the Data Protection Board notification package — the reportable output of the
            breach workflow.
          </>
        }
      />
    </Shell>
  );
}
