import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, formatDateTime } from "@/components/ui";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { listNotifications } from "@/lib/engines/notification";
import { getSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/domain";
import { CATEGORY_LABEL, CATEGORY_ORDER, SEVERITY_RANK, type NotificationCategory } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Full notification history — the "View all" destination from the header bell.
 * Filterable list of everything sent to the acting role. The bell is the triage
 * inbox; this is the archive. No preference controls here — those live in Settings.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; severity?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  let notifications = await listNotifications(session.role, 200);

  if (params.category) notifications = notifications.filter((n) => n.category === params.category);
  if (params.severity) notifications = notifications.filter((n) => n.severity === params.severity);
  // Severity-first, then recency.
  notifications = [...notifications].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2) || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <Shell active="/dashboard" title="Notifications">
      <PageHead
        title={`Notifications for the ${ROLE_LABEL[session.role]}`}
        titleTip="Everything sent to this role, newest and most severe first. Configure what you receive in Settings → Notifications."
      />

      <CompactFilterBar
        basePath="/notifications"
        facets={[
          { key: "category", label: "Category", options: CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
          { key: "severity", label: "Severity", options: [{ value: "critical", label: "Critical" }, { value: "warning", label: "Warning" }, { value: "info", label: "Info" }] },
        ]}
      />

      {notifications.length === 0 ? (
        <Card><div className="empty">Nothing matches. Switch the acting role or clear the filters.</div></Card>
      ) : (
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr><th style={{ width: 160 }}>When</th><th>Notification</th><th style={{ width: 170 }}>Category</th><th style={{ width: 100 }}>Severity</th><th style={{ width: 70 }} /></tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} className={n.readAt ? "" : "notif-unread"}>
                  <td className="cell-sub">{formatDateTime(n.createdAt)}</td>
                  <td><div className="cell-stack"><span className="cell-primary">{n.title}</span><span className="cell-sub">{n.body}</span></div></td>
                  <td className="cell-sub">{CATEGORY_LABEL[n.category as NotificationCategory] ?? n.category}</td>
                  <td><Pill tone={n.severity === "critical" ? "red" : n.severity === "warning" ? "yellow" : "gray"}>{n.severity}</Pill></td>
                  <td>{n.linkedHref ? <Link href={n.linkedHref} className="row-link">Open</Link> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
