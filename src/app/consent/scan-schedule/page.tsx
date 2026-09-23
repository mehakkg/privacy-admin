import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { ScanScheduleForm } from "@/components/consentInfra/ScanScheduleForm";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Scan scheduling (recurring monthly / on-demand) for the cookie
 *  compliance scan, extending the existing manual trigger. */
export default async function ScanSchedulePage() {
  const sched = await db.cookieScanSchedule.findUnique({ where: { id: "cookie" } });
  return (
    <Shell active="/consent/scan-schedule" title="Consent / Scan schedule">
      <PageHead title="Cookie scan scheduling" titleTip="Schedule the cookie/script compliance scan to run monthly instead of only on demand. Same engine, new cadence, with last-run and next-run always visible." />
      <ScanScheduleForm
        cadence={sched?.cadence ?? "on_demand"}
        lastRunAt={sched?.lastRunAt ? formatDateTime(sched.lastRunAt) : null}
        nextRunAt={sched?.nextRunAt ? formatDateTime(sched.nextRunAt) : null}
      />
    </Shell>
  );
}
