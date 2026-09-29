import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Masking rule library merged into Protection rules › Library, filtered to masking. */
export default function MaskingRulesRedirect() {
  redirect("/data-flow/protection-rules?tab=library&type=masking");
}
