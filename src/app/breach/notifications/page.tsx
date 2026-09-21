import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, Notice, formatDate } from "@/components/ui";
import { SEVERITY_TONE, BREACH_STATUS_LABEL, RULE_8_6_FIELDS, clock } from "@/lib/breach";

export const dynamic = "force-dynamic";

/**
 * SCREEN — Notifications & Board reporting (cross-incident).
 *
 * The statutory-output queue: for every incident, the state of the two-stage
 * Board notification against the 72-hour clock — Stage 1 immediate description,
 * Stage 2 six-field Rule 8(6)(b) package, and whether it has been submitted.
 * Compiling and submitting happen in the incident's Board-notification tab; this
 * is the deadline-oriented overview across all incidents.
 */
export default async function BreachNotificationsPage() {
  const incidents = await db.breachIncident.findMany({
    include: { entity: { select: { name: true } }, boardPackage: true },
    orderBy: { detectedAt: "desc" },
  });

  const rows = incidents.map((i) => {
    const pkg = i.boardPackage;
    const fieldsComplete = RULE_8_6_FIELDS.filter((f) => {
      const v = pkg ? (pkg as unknown as Record<string, unknown>)[f.key] : null;
      return typeof v === "string" && v.trim().length > 0;
    }).length;
    const submitted = Boolean(pkg?.submittedAt);
    const notified = submitted || ["board_notified", "remediation", "closed"].includes(i.status);
    const c = clock(i.detectedAt.toISOString());
    return { i, pkg, fieldsComplete, submitted, notified, clock: c };
  });

  const overdue = rows.filter((r) => !r.notified && r.clock.band === "breached").length;
  const awaitingSubmission = rows.filter((r) => !r.submitted && !["closed"].includes(r.i.status)).length;
  const notified = rows.filter((r) => r.submitted).length;

  return (
    <Shell active="/breach/notifications" title="Breach Management / Notifications & Board reporting">
      <PageHead
        title="Notifications & Board reporting"
        titleTip="The reportable output of the breach workflow: the two-stage Data Protection Board notification (immediate description, then the six-field Rule 8(6)(b) report) tracked against the 72-hour clock (DPDP s.8(6)). Compile and submit inside each incident's Board-notification tab."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Past 72h, not notified" value={overdue} tone={overdue ? "red" : undefined} />
        <Stat label="Awaiting submission" value={awaitingSubmission} tone={awaitingSubmission ? "yellow" : undefined} />
        <Stat label="Submitted to Board" value={notified} tone={notified ? "green" : undefined} />
      </div>

      {overdue > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger" title={`${overdue} incident${overdue === 1 ? "" : "s"} past the 72-hour Board-notification deadline and not yet notified`}>
            The Board must be notified without delay once a breach is known (DPDP s.8(6)). Open the incident to compile and submit its package.
          </Notice>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Severity</th>
              <th>72h clock</th>
              <th>Stage 1 — immediate</th>
              <th>Stage 2 — six-field report</th>
              <th>Board</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, pkg, fieldsComplete, submitted, notified, clock: c }) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/breach/incidents/${i.id}`} className="row-link mono">{i.reference}</Link>
                  <div className="cell-sub">{i.entity?.name ?? "Entity not set"} · {BREACH_STATUS_LABEL[i.status] ?? i.status}</div>
                </td>
                <td><Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill></td>
                <td>
                  {notified
                    ? <Pill tone="green" dot={false}>window met</Pill>
                    : <span style={{ color: c.band === "breached" ? "var(--red)" : c.band === "due_soon" ? "var(--yellow)" : "var(--text-3)", fontWeight: c.band === "ok" ? 400 : 600 }}>
                        {c.hoursRemaining <= 0 ? `${-c.hoursRemaining}h overdue` : `${c.hoursRemaining}h left`}
                      </span>}
                </td>
                <td>
                  {pkg?.immediateSentAt
                    ? <div className="cell-stack"><Pill tone="green" dot={false}>Sent</Pill><span className="cell-sub">{formatDate(pkg.immediateSentAt)}</span></div>
                    : <Pill tone="gray" dot={false}>Not sent</Pill>}
                </td>
                <td>
                  <div className="cell-stack">
                    <span style={{ color: fieldsComplete === 6 ? "var(--green)" : undefined, fontWeight: fieldsComplete === 6 ? 600 : 400 }}>
                      {fieldsComplete}/6 fields
                    </span>
                    {!submitted && fieldsComplete < 6 && <span className="cell-sub">{6 - fieldsComplete} remaining</span>}
                  </div>
                </td>
                <td>
                  {submitted
                    ? <div className="cell-stack">
                        <Pill tone="green" dot={false}>Submitted</Pill>
                        <span className="cell-sub">{pkg?.submittedAt ? formatDate(pkg.submittedAt) : ""}{pkg?.selfApproved ? " · self-approved" : ""}</span>
                      </div>
                    : <Link href={`/breach/incidents/${i.id}`} className="btn xs">Compile →</Link>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6}><div className="empty">No incidents to report.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
