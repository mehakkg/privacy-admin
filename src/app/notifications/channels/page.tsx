import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/notifications/channels" title={"Notification channels"}>
      <Placeholder
        title={"Notification channels"}
        tip={"Configure the actual delivery mechanisms — email, SMS, Slack."}
        what={"Channels are the setup layer that Onboarding's Notification Routing step assumes already exists. This screen will let you add, test, and manage each delivery mechanism the platform can send through."}
      />
    </Shell>
  );
}
