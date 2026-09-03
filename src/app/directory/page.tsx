import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/directory" title={"User directory"}>
      <Placeholder
        title={"User directory"}
        tip={"A searchable registry of known Data Principals and their consent and data status, independent of any single active request."}
        what={"For the “look up this specific person's full record” case, which nothing currently covers outside the context of an open Request. Searchable by identifier, showing consent state, data held, and request history at a glance."}
      />
    </Shell>
  );
}
