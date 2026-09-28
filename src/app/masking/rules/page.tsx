import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The masking rule library merged into the single Rule library, filtered to masking. */
export default function MaskingRulesRedirect() {
  redirect("/data-flow/protection-rules/library?type=masking");
}
