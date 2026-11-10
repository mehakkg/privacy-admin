import { ExternalConsole } from "@/components/console/ExternalConsole";
import { getCurrentRole } from "@/lib/session";
import { personaFor, productsFor } from "@/lib/products/people";

export const dynamic = "force-dynamic";

/**
 * miniOrange DLP console (navigation prototype). A separate product with no real
 * codebase here, reached through the product switcher. Deep links from Privacy
 * (`/switch/dlp?object=…&from=…`) redirect here and show the return bar.
 */
export default async function DlpConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string; from?: string; fromHref?: string }>;
}) {
  const sp = await searchParams;
  const role = await getCurrentRole();
  return (
    <ExternalConsole
      product="dlp"
      products={productsFor(role)}
      viewerName={personaFor(role).name}
      object={sp.object}
      from={sp.from}
      fromHref={sp.fromHref}
    />
  );
}
