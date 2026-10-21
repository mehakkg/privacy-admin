import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Retention schedules (Configure › Data Protection). The single place retention
 *  periods are defined; deletions, consent expiry and the dashboard's "Blocked on
 *  retention" count read from here. Full list + drawer land in the next milestone. */
export default function RetentionSchedulesPage() {
  return (
    <Shell active="/data-protection/retention" title="Data Protection / Retention schedules">
      <PageHead title="Retention schedules" titleTip="How long each category of personal data is kept, and why. Deletions and consent expiry follow these rules." />
      <p className="cell-sub" style={{ margin: "0 0 16px" }}>How long each category of personal data is kept, and why. Deletions and consent expiry follow these rules.</p>
      <div className="empty">Retention schedules are being built in this release.</div>
    </Shell>
  );
}
