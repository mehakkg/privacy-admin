import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/risk/access-insights" title={"Access Insights"}>
      <Placeholder
        title={"Access Insights"}
        tip={"A privacy lens over access — not an execution surface. RBAC and provisioning stay IAM's."}
        what={
          <>
            Two tabs: <strong>Personal data access review</strong> (which access grants
            touch personal-data-holding systems, flagged where over-broad) and{" "}
            <strong>Dormant accounts</strong> (consumed from IAM&rsquo;s own dormancy
            detection, filtered to the privacy-relevant subset). RBAC-matrix editing and
            provisioning execution are explicitly excluded — they are IAM&rsquo;s domain.
          </>
        }
      />
    </Shell>
  );
}
