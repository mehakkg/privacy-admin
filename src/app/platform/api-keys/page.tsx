import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/platform/api-keys" title={"API keys"}>
      <Placeholder
        title={"API keys"}
        tip={"Keys for a customer's own systems to call this platform programmatically."}
        what={"Distinct from Connected Systems (which are targets this platform reaches out to). API keys are inbound credentials your own systems use to call this platform. This screen will issue, scope, rotate, and revoke them."}
      />
    </Shell>
  );
}
