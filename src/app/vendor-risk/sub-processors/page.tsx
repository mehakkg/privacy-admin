import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/vendor-risk/sub-processors" title={"Vendor Risk / Sub-processor disclosures"}>
      <Placeholder
        title={"Sub-processor disclosures"}
        tip={"Who the processors hand data to next — disclosed, held pending approval, or caught undisclosed."}
        what={
          <>
            Sub-processor disclosure registration, engagement-hold-pending-approval, and
            undisclosed-transfer detection surfaced on the flow map. Closes the chain
            past the direct processor.
          </>
        }
      />
    </Shell>
  );
}
