import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/platform/branding" title={"Branding"}>
      <Placeholder
        title={"Branding"}
        tip={"Platform-wide branding — the single source the Consent Platform's Preference Center styling should reference."}
        what={"Branding is platform-wide, not Consent-Platform-scoped. The Preference Center should read this same setting rather than keep a separate copy, so a logo or colour change is made once and applies everywhere the organisation is shown."}
      />
    </Shell>
  );
}
