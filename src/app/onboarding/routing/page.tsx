import { db } from "@/lib/db";
import { Card, Notice, PageHead } from "@/components/ui";
import { RoutingEditor } from "@/components/onboardingForms";
import { ROUTABLE_EVENTS } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6 — Configure Notification Routing. Skippable.
 *
 * Every row ships with a default and the reason for it, because a routing table
 * of empty dropdowns gets filled in arbitrarily or skipped. The defaults follow
 * from who is accountable: completions to the Grievance Officer because they
 * answer to the Data Principal, failures and SLA risk to the DPO because those
 * put a statutory deadline in play.
 *
 * The one row that cannot be defaulted is a custom event — nothing in the
 * product knows who should hear about it, so it must be assigned explicitly
 * rather than left silently unrouted.
 */
export default async function RoutingStep() {
  const [existing, actors] = await Promise.all([
    db.notificationRoute.findMany(),
    db.actor.findMany(),
  ]);

  const byEvent = new Map(existing.map((r) => [r.eventType, r]));

  const rows = [
    ...ROUTABLE_EVENTS.map((e) => {
      const saved = byEvent.get(e.eventType);
      const role = saved?.recipientRole ?? e.defaultRole;
      return {
        eventType: e.eventType,
        label: e.label,
        recipientRole: role,
        channel: saved?.channel ?? e.defaultChannel,
        rationale: e.rationale,
        isCustom: false,
        // The CISO fixture has notifications muted, so the respect-their-setting
        // path has something real to show.
        recipientMuted: role === "ciso",
      };
    }),
    // A deliberately non-standard event, to exercise the no-default rule.
    ...(byEvent.has("processor.confirmation_overdue")
      ? []
      : [
          {
            eventType: "processor.confirmation_overdue",
            label: "Processor confirmation overdue",
            recipientRole: "",
            channel: "in_app",
            rationale:
              "No default — who chases a vendor differs by organisation, so this one has to be assigned.",
            isCustom: true,
            recipientMuted: false,
          },
        ]),
  ];

  const roles = [...new Set(actors.map((a) => a.role))].filter((r) => r !== "system");

  return (
    <div className="stack">
      <PageHead
        title="Notification routing"
        subtitle="Who hears about what, and how. Cross-persona alerts fire automatically either way — this decides where they land."
      />

      <Notice tone="info" title="Skipping keeps the defaults, it does not turn notifications off">
        The notification engine is event-driven and always on: when Admin
        completes, fails or escalates something another role is waiting on, they
        are told without Admin doing anything. This screen only changes who and
        by which channel.
      </Notice>

      <Card title="Event routing">
        <RoutingEditor events={rows} roles={roles} />
      </Card>
    </div>
  );
}
