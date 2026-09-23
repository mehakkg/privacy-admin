import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { GeoSimulator } from "@/components/consentInfra/GeoSimulator";

export const dynamic = "force-dynamic";

/** SCREEN 5 — Geo-detection compliance verification (simulator over real logic). */
export default function GeoVerifyPage() {
  return (
    <Shell active="/consent/geo-verify" title="Consent / Geo verification">
      <PageHead title="Geo-detection compliance verification" titleTip="Simulate a visitor from a given location and see exactly which compliance-model banner (DPDP / GDPR / baseline) would render — using the real detection logic." />
      <GeoSimulator />
    </Shell>
  );
}
