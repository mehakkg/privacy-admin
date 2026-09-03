import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/data-flow/integrity" title={"Data Integrity"}>
      <Placeholder
        title={"Data Integrity"}
        tip={"The Section 8(3) obligation: completeness, accuracy and consistency of data used in a decision affecting a Data Principal, or disclosed to another Fiduciary."}
        what={"Sits alongside Protection Rules because both safeguard data in a way that is not about deletion or access. This screen will track and evidence the accuracy and consistency checks that s.8(3) requires before personal data drives a decision or leaves for another Fiduciary."}
      />
    </Shell>
  );
}
