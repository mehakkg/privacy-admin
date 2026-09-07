import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/settings/organization" title={"Organization"}>
      <Placeholder
        title={"Organization"}
        tip={"Organization-level profile and branding."}
        what={
          <>
            Tabs: <strong>Profile</strong> and <strong>Branding</strong>. The organization&rsquo;s
            own details and the branding applied to notices, the preference centre, and
            other Data-Principal-facing surfaces.
          </>
        }
      />
    </Shell>
  );
}
