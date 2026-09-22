import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { DeliveryLog, type DeliveryRow } from "@/components/omnichannel/DeliveryLog";

export const dynamic = "force-dynamic";

/** SCREEN 6 — Multi-Channel Notification Delivery log. Shows the channel used and
 *  outcome per notification, with retry on failure. */
export default async function DeliveryLogPage() {
  const notifications = await db.notification.findMany({
    where: { deliveryChannel: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { request: { select: { referenceCode: true } } },
  });
  const rows: DeliveryRow[] = notifications.map((n) => ({
    id: n.id, title: n.title, channel: n.deliveryChannel!, status: n.deliveryStatus ?? "sent",
    detail: n.deliveryDetail, retries: n.deliveryRetries, createdAt: formatDateTime(n.createdAt),
    reference: n.request?.referenceCode ?? null,
  }));

  return (
    <Shell active="/notifications/delivery" title="Notifications / Delivery log">
      <PageHead title="Multi-channel notification delivery" titleTip="Every acknowledgment dispatched via a data principal's preferred channel, with its delivery outcome and a retry path on failure." />
      <DeliveryLog rows={rows} />
    </Shell>
  );
}
