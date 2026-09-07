import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/requests/sla" title={"SLA & Routing"}>
      <Placeholder
        title={"SLA & Routing"}
        tip={"How rights requests are assigned and how their statutory clocks are tracked."}
        what={
          "Configuration for request routing and the statutory-deadline (SLA) clocks that " +
          "govern each request type — the rules that decide who a request lands with and when it is at risk."
        }
      />
    </Shell>
  );
}
