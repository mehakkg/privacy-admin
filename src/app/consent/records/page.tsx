import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/consent/records" title={"Consent Records"}>
      <Placeholder
        title={"Consent Records"}
        tip={"The record of consent given and withdrawn, per Data Principal."}
        what={
          <>
            Records and Withdrawals of consent artifacts. <strong>Open item — not
            built pending confirmation:</strong> this may duplicate the Consent
            Platform&rsquo;s Verification tab, which already shows the consent-artifact
            integrity table. If it is the same data, this becomes a relocation, not
            a second build. Left as a reserved home until that is confirmed.
          </>
        }
      />
    </Shell>
  );
}
