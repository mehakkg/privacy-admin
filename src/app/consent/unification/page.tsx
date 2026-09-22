import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { UnificationMonitor, type CheckView } from "@/components/omnichannel/UnificationMonitor";

export const dynamic = "force-dynamic";

/** SCREEN 5 — Omnichannel Unification Monitor. Active comparison across every
 *  channel; clean default is a positive-confirmation tile, discrepancies are
 *  named specifically with drill-down. */
export default async function UnificationPage() {
  const checks = await db.unificationCheck.findMany({ orderBy: { runAt: "desc" }, take: 10 });
  const toView = (c: (typeof checks)[number]): CheckView => {
    let summary: CheckView["summary"] = {};
    try { summary = JSON.parse(c.summaryJson); } catch { summary = {}; }
    return { id: c.id, runAt: formatDateTime(c.runAt), discrepancyFound: c.discrepancyFound, discrepancyDetail: c.discrepancyDetail, summary, runBy: c.runBy };
  };
  const latest = checks[0] ? toView(checks[0]) : null;
  const history = checks.slice(1).map(toView);

  return (
    <Shell active="/consent/unification" title="Consent / Omnichannel unification">
      <PageHead title="Omnichannel unification monitor" titleTip="Actively compares DPRR tickets and consent records across every channel. The clean state is a verified 0-discrepancy result; any discrepancy is named specifically." />
      <UnificationMonitor latest={latest} history={history} />
    </Shell>
  );
}
