import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/breach/incidents" title={"Breach Management / Incidents"}>
      <Placeholder
        title={"Incidents"}
        tip={"Personal Data Breach Management — highest statutory exposure (72-hour Board clock, DPDP Rule 7)."}
        what={
          <>
            Incident intake (including a public / self-service reporting channel),
            categorization, and severity auto-calculation. The entry point of the
            breach workflow — where the 72-hour notification clock starts.
          </>
        }
      />
    </Shell>
  );
}
