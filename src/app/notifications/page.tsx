import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Pill, formatDateTime } from "@/components/ui";
import { getSession } from "@/lib/session";
import { listNotifications } from "@/lib/engines/notification";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<string, "red" | "yellow" | "gray"> = { critical: "red", warning: "yellow", info: "gray" };

/** Notifications inbox — the access point that replaced the header bell when the
 *  shell was reduced to two controls. Lists recent notifications for the acting
 *  role; each links to its source record. */
export default async function NotificationsPage() {
  const { role } = await getSession();
  const items = await listNotifications(role, 50);

  return (
    <Shell active="/notifications" title="Notifications">
      <PageHead title="Notifications" titleTip="Recent notifications for your role. Each links to the record that raised it." />
      {items.length === 0 ? (
        <div className="empty">No notifications.</div>
      ) : (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Severity</th><th>Notification</th><th>When</th><th></th></tr></thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} style={n.readAt ? undefined : { background: "var(--bg-selected)" }}>
                  <td><Pill tone={SEV_TONE[n.severity] ?? "gray"} dot={false}>{n.severity}</Pill></td>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{n.title}</span>
                      <span className="cell-sub">{n.body}</span>
                    </div>
                  </td>
                  <td className="cell-sub">{formatDateTime(n.createdAt)}</td>
                  <td>{n.linkedHref && <Link href={n.linkedHref} className="row-link">Open →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
