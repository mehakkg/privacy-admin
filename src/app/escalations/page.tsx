import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead, Stat, formatDate, formatDateTime } from "@/components/ui";
import { EscalationReview, type EscalationRow } from "@/components/escalationReview";
import { decodeObject } from "@/lib/codec/json";
import { getCurrentRole } from "@/lib/session";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

const STATUS_TO_DB: Record<string, string> = {
  open: "open",
  ruled: "ruled",
  closed: "withdrawn",
};

/** Roles an escalation can be routed to. */
const TARGET_ROLES = ["dpo", "ciso", "legal"];

/**
 * ESCALATIONS — the convergence screen.
 *
 * Every escalation-creating action across the product — a retention conflict, a
 * rule request or exception, a DPA update, a new-purpose request — lands here as
 * one object, distinguished by type, routed to whichever governance role owns
 * the decision. Ruling authority follows the "Acting as" role switcher; a role
 * no one is assigned to queues visibly rather than going nowhere.
 *
 * This internal handoff is NOT the Grievance-to-Board escalation, which is a
 * statutory, external process on the Grievance side. Nothing here leaves the
 * organisation.
 */
export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; routed?: string; q?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "open";
  const term = (params.q ?? "").trim();

  const [all, escalations, actors, purposes, currentRole] = await Promise.all([
    db.escalation.findMany({ select: { status: true } }),
    db.escalation.findMany({
      where: statusFilter === "all" ? {} : { status: STATUS_TO_DB[statusFilter] ?? "open" },
      include: { request: true, exception: true, ruledBy: true },
      orderBy: { createdAt: "desc" },
    }),
    db.actor.findMany({ select: { role: true } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    getCurrentRole(),
  ]);

  const assignedRoles = new Set(actors.map((a) => a.role));
  const vacantRoles = TARGET_ROLES.filter((r) => !assignedRoles.has(r));

  const open = all.filter((e) => e.status === "open").length;
  const ruled = all.filter((e) => e.status === "ruled").length;
  const closed = all.filter((e) => e.status === "withdrawn").length;

  const now = Date.now();

  let rows: EscalationRow[] = escalations
    .filter((e) => (params.type ? e.type === params.type : true))
    .filter((e) => (params.routed ? e.targetRole === params.routed : true))
    .map((e) => {
      const context = decodeObject<Record<string, unknown>>(e.contextJson) ?? {};
      const contextPairs = Object.entries(context)
        .filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "withdrawnBecause")
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)] as [string, string]);

      return {
        id: e.id,
        reference: e.referenceCode ?? `ESC-${e.id.slice(-6).toUpperCase()}`,
        type: e.type,
        requestId: e.requestId,
        requestRef: e.request?.referenceCode ?? null,
        sourceRole: e.sourceRole,
        targetRole: e.targetRole,
        raised: formatDate(e.createdAt),
        ageDays: Math.floor((now - e.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
        status: e.status,
        reason: e.reason,
        contextPairs,
        ruling: e.ruling,
        rulingRationale: e.rulingRationale,
        ruledBy: e.ruledBy?.name ?? null,
        ruledAt: e.ruledAt ? formatDateTime(e.ruledAt) : null,
        withdrawnBecause:
          typeof context.withdrawnBecause === "string" ? context.withdrawnBecause : null,
      };
    });

  if (term) {
    const t = term.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.reference.toLowerCase().includes(t) ||
        (r.requestRef ?? "").toLowerCase().includes(t) ||
        r.reason.toLowerCase().includes(t),
    );
  }

  return (
    <Shell active="/escalations" title="Escalations">
      <PageHead
        title="Escalations"
        titleTip="Decisions Admin cannot make alone, routed to the governance role that owns them. One object for every source — retention conflicts, rule exceptions, DPA updates, purpose requests."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open" value={open} tone={open ? "yellow" : undefined} />
        <Stat label="Ruled" value={ruled} />
        <Stat label="Closed" value={closed} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <Notice tone="info" title={`You are acting as: ${ROLE_LABEL[currentRole]}`}>
          Ruling authority follows the &ldquo;Acting as&rdquo; switcher in the header.
          You can rule only on escalations routed to your current role; on the rest you
          see the read-only awaiting state. This is an internal handoff — it never
          goes to the Data Protection Board.
        </Notice>
      </div>

      <CompactFilterBar
        basePath="/escalations"
        searchPlaceholder="Search by reference or request…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "open", label: "Open" },
              { value: "ruled", label: "Ruled" },
              { value: "closed", label: "Closed" },
              { value: "all", label: "All" },
            ],
          },
          {
            key: "type",
            label: "Type",
            options: [
              { value: "retention_conflict", label: "Retention conflict" },
              { value: "policy_ambiguity", label: "Policy ambiguity" },
              { value: "rule_request", label: "Rule request" },
              { value: "rule_exception", label: "Rule exception" },
              { value: "purpose_request", label: "Purpose request" },
              { value: "dpa_update", label: "DPA update" },
              { value: "other", label: "Other" },
            ],
          },
          {
            key: "routed",
            label: "Routed to",
            options: [
              { value: "dpo", label: "DPO" },
              { value: "ciso", label: "CISO" },
              { value: "legal", label: "Legal" },
            ],
          },
        ]}
      />

      <EscalationReview
        rows={rows}
        currentRole={currentRole}
        vacantRoles={vacantRoles}
        existingCategories={purposes.map((p) => p.name)}
      />
    </Shell>
  );
}
