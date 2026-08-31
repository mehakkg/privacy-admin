import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, Notice, PageHead, Pill, formatDateTime } from "@/components/ui";
import { listNotifications } from "@/lib/engines/notification";
import { getSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Cross-persona notifications (acceptance criterion 3).
 *
 * Everything listed here was written by the notification engine as a consequence
 * of a state change. There is no "notify" action in the Admin UI, and no screen
 * calls the engine directly — if a screen could choose whether to notify, the
 * notification would be optional.
 *
 * Switch the acting role in the header to see what the Grievance Officer or the
 * DPO received without Admin doing anything.
 */
export default async function NotificationsPage() {
  const session = await getSession();
  const notifications = await listNotifications(session.role, 100);

  return (
    <Shell active="/requests" title="Notifications">
      <PageHead
        title={`Notifications for the ${ROLE_LABEL[session.role]}`}
        subtitle="Written automatically when a request's state changes. Admin performs no separate notify step."
      />

      {notifications.length === 0 ? (
        <Card>
          <div className="empty">
            Nothing has been sent to this role yet. Execute or fail something on a
            request and it will appear here without any further action.
          </div>
        </Card>
      ) : (
        <div className="stack">
          <Notice tone="info">
            {notifications.length} notification
            {notifications.length === 1 ? "" : "s"} — each one is the by-product of
            a state change, recorded in the same transaction that produced it.
          </Notice>

          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 175 }}>When</th>
                  <th>Notification</th>
                  <th>Triggered by</th>
                  <th style={{ width: 110 }}>Severity</th>
                  <th style={{ width: 90 }}>Request</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="cell-sub">{formatDateTime(n.createdAt)}</td>
                    <td>
                      <div className="cell-stack">
                        <span className="cell-primary">{n.title}</span>
                        <span className="cell-sub">{n.body}</span>
                      </div>
                    </td>
                    <td className="mono cell-sub">{n.triggerEvent}</td>
                    <td>
                      <Pill
                        tone={
                          n.severity === "critical"
                            ? "red"
                            : n.severity === "warning"
                              ? "yellow"
                              : "gray"
                        }
                      >
                        {n.severity}
                      </Pill>
                    </td>
                    <td>
                      {n.requestId ? (
                        <Link href={`/requests/${n.requestId}`} className="row-link">
                          Open
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
