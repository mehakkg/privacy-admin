import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/notifications/routing" title={"Notification routing"}>
      <Placeholder
        title={"Notification routing"}
        tip={"Per-event-type recipient assignment — the routing Onboarding configures once, given a permanent home."}
        what={"Onboarding sets routing once; nothing currently lets you revisit or adjust it afterwards. This screen is that permanent home — which role or person receives each event type, editable at any time."}
      />
    </Shell>
  );
}
