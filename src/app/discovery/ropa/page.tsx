import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/discovery/ropa" title={"ROPA Recommendations"}>
      <Placeholder
        title={"ROPA Recommendations"}
        tip={"AI-suggested entries for your formal Record of Processing Activities register, generated from what Discovery has already scanned and classified."}
        what={"Recommendations are generated from discovery and classification output — distinct from Processing Activities, which is the manual/CSV table for entries you add directly. Each suggestion will be reviewable, editable, and either accepted into the ROPA register or dismissed."}
      />
    </Shell>
  );
}
