import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { EvidenceWorkspace, type EvidenceView, type EntryRow } from "@/components/scenario3/EvidenceWorkspace";
import { searchAuditLog } from "@/lib/engines/audit";

export const dynamic = "force-dynamic";

/** SCREENS 2–4 — Unified Audit Log Search → Verification Gate → Export & Delivery
 *  for one evidence request. */
export default async function EvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await db.evidenceRequest.findUnique({ where: { id }, include: { confirmations: true } });
  if (!request) notFound();

  // The unified search: every module's audit entries for this customer in range.
  const raw = await searchAuditLog({ customerId: request.customerId, from: request.dateFrom ?? undefined, to: request.dateTo ?? undefined, take: 500 });
  const hint = request.eventTypeHint?.toLowerCase() ?? null;

  const entries: EntryRow[] = raw.map((e) => {
    const sourceModule = e.sourceModule ?? e.action.split(".")[0] ?? "system";
    const eventType = e.eventType ?? e.action;
    const eventDescription = e.eventDescription ?? `${e.action} on ${e.targetType}`;
    const suggested = Boolean(hint && (eventType.toLowerCase().includes(hint) || sourceModule.toLowerCase().includes(hint)));
    return { id: e.id, sourceModule, eventType, eventDescription, occurredAt: formatDateTime(e.timestamp), suggested };
  });

  const decisions: Record<string, boolean> = {};
  for (const c of request.confirmations) decisions[c.logEntryId] = c.confirmed;

  const view: EvidenceView = {
    requestId: request.id,
    customerId: request.customerId,
    claimedEvent: request.claimedEvent,
    requestedBy: request.requestedBy,
    dateRange: `${request.dateFrom ? request.dateFrom.toISOString().slice(0, 10) : "—"} → ${request.dateTo ? request.dateTo.toISOString().slice(0, 10) : "—"}`,
    status: request.status,
    hint: request.eventTypeHint,
    entries,
    decisions,
  };

  return (
    <Shell active="/audit-trail/evidence" title={`Audit & Escalation / Evidence · ${request.customerId}`}>
      <PageHead
        crumbs={[{ label: "Evidence requests", href: "/audit-trail/evidence" }, { label: request.customerId }]}
        title="Verify & export evidence"
        titleTip="Search runs across every module's audit log for this customer. Confirm or reject each entry, then export only the confirmed set. The underlying audit log is never modified."
      />
      <EvidenceWorkspace view={view} />
    </Shell>
  );
}
