import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Scan configuration moved to Settings › Integrations › DLP. */
export default function ScanConfigRedirect() {
  redirect("/integrations/dlp?moved=sources");
}
