import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { WebhookTester, type WebhookRow, type DeliveryRow } from "@/components/consentInfra/WebhookTester";

export const dynamic = "force-dynamic";

/** SCREEN 5 — Webhook test & delivery log. */
export default async function WebhooksPage() {
  const [webhooks, deliveries] = await Promise.all([
    db.webhook.findMany({ orderBy: { createdAt: "asc" } }),
    db.webhookDelivery.findMany({ orderBy: { attemptAt: "desc" }, take: 50 }),
  ]);
  const endpointById = new Map(webhooks.map((w) => [w.id, w.endpoint]));
  const w: WebhookRow[] = webhooks.map((x) => ({ id: x.id, endpoint: x.endpoint, event: x.event, status: x.status, lastTestResult: x.lastTestResult }));
  const d: DeliveryRow[] = deliveries.map((x) => ({ id: x.id, endpoint: endpointById.get(x.webhookId) ?? "—", event: x.event, status: x.status, responseCode: x.responseCode, retryCount: x.retryCount, detail: x.detail, attemptAt: formatDateTime(x.attemptAt) }));

  return (
    <Shell active="/consent/webhooks" title="Consent / Webhooks">
      <PageHead title="Webhook test & delivery log" titleTip="Send a test consent-change event and confirm delivery, failure and retry actually work — not just that the config saved." />
      <WebhookTester webhooks={w} deliveries={d} />
    </Shell>
  );
}
