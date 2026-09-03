import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/notifications/templates" title={"Notification templates"}>
      <Placeholder
        title={"Notification templates"}
        tip={"The message content sent for each event type."}
        what={"Templates define what each notification says. Paired with Channels (how it is delivered) and Routing (who receives it), they complete the notification setup that until now lived only inside Onboarding."}
      />
    </Shell>
  );
}
