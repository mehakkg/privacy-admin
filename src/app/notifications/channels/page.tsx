import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { NotificationPreferences, type PrefValue } from "@/components/settings/NotificationPreferences";
import { getCurrentRole } from "@/lib/session";
import { decodeList } from "@/lib/codec/json";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SETTINGS → NOTIFICATIONS — per-person configuration. Scoped to the acting role;
 * one person's preferences never affect what another sees. Distinct from the
 * header bell (triage inbox) — no preference controls live there.
 */
export default async function NotificationSettingsPage() {
  const role = await getCurrentRole();
  const rows = await db.notificationPreference.findMany({ where: { role } });
  const initial: Record<string, PrefValue> = {};
  for (const r of rows) initial[r.category] = { channels: decodeList(r.channelsJson), muted: r.muted };

  return (
    <Shell active="/notifications/channels" title="Notifications">
      <PageHead
        title="Notifications"
        subtitle={`How you're notified as the ${ROLE_LABEL[role as ActorRole] ?? role}. In-app drives the header bell; email is the delivery channel. Changes save immediately.`}
      />
      <NotificationPreferences initial={initial} />
    </Shell>
  );
}
