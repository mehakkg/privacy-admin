import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/audit/violations" title={"Policy violation dashboard"}>
      <Placeholder
        title={"Policy violation dashboard"}
        tip={"A proactive, system-detected violations feed — problems the system found on its own."}
        what={"Broader than Cookie & Website Compliance Monitoring (which only catches undisclosed scripts), and distinct from Escalations (conflicts a person raised) and Analytics (which scores posture rather than listing specific violations). This is the missing “the system found a problem on its own” category."}
      />
    </Shell>
  );
}
