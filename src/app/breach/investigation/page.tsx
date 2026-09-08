import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/breach/investigation" title={"Breach Management / Investigation"}>
      <Placeholder
        title={"Investigation"}
        tip={"Scoping the breach: what data, whose, and which processors were involved."}
        what={
          <>
            PII / purpose / processor mapping for the incident, processor outreach and
            confirmation intake, and closed-cohort identification of the affected Data
            Principals.
          </>
        }
      />
    </Shell>
  );
}
