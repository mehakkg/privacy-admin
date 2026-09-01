import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead, Stat } from "@/components/ui";
import { EscalationReview, type EscalationRow } from "@/components/escalationReview";
import { decodeObject } from "@/lib/codec/json";
import { formatDate, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TO_DB: Record<string, string> = {
  open: "open",
  ruled: "ruled",
  closed: "withdrawn",
};

/**
 * ESCALATIONS — one page, filtered.
 *
 * Open / Ruled / Closed were three sidebar entries for one status field. That
 * is exactly the pattern this revision removes: a status is a filter on one
 * list, never a set of navigation items.
 */
export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "open";
  const term = (params.q ?? "").trim();

  const conflictType = (e: { exception: unknown; request: unknown }): string =>
    e.exception ? "Retention conflict" : e.request ? "Policy ambiguity" : "Other";

  const [all, escalations] = await Promise.all([
    db.escalation.findMany({ select: { status: true } }),
    db.escalation.findMany({
      where: statusFilter === "all" ? {} : { status: STATUS_TO_DB[statusFilter] ?? "open" },
      include: { request: true, exception: true, ruledBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const open = all.filter((e) => e.status === "open").length;
  const ruled = all.filter((e) => e.status === "ruled").length;
  const closed = all.filter((e) => e.status === "withdrawn").length;

  const now = Date.now();

  let rows: EscalationRow[] = escalations
    .filter((e) => (params.type ? conflictTypeKey(e) === params.type : true))
    .map((e) => {
      const context = decodeObject<Record<string, unknown>>(e.contextJson) ?? {};
      const contextPairs = Object.entries(context)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)] as [string, string]);

      return {
        id: e.id,
        reference: e.id,
        requestId: e.requestId,
        requestRef: e.request?.referenceCode ?? null,
        conflictType: conflictType(e),
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
        (r.requestRef ?? "").toLowerCase().includes(t) ||
        r.reason.toLowerCase().includes(t),
    );
  }

  return (
    <Shell active="/escalations" title="Escalations">
      <PageHead
        title="Escalations"
        titleTip="Conflicts Admin cannot resolve alone. Raised with full context attached, tracked until a documented ruling comes back."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open" value={open} tone={open ? "yellow" : undefined} />
        <Stat label="Ruled" value={ruled} />
        <Stat label="Closed" value={closed} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <Notice tone="info" title="Admin raises; Governance rules">
          A technical action that collides with a governance rule stops here
          rather than being decided at the console. Admin cannot record a ruling
          — the server refuses it.
        </Notice>
      </div>

      <CompactFilterBar
        basePath="/escalations"
        searchPlaceholder="Search by request reference…"
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
              { value: "retention", label: "Retention conflict" },
              { value: "policy", label: "Policy ambiguity" },
              { value: "other", label: "Other" },
            ],
          },
        ]}
      />

      <EscalationReview rows={rows} />
    </Shell>
  );
}

function conflictTypeKey(e: { exception: unknown; request: unknown }): string {
  return e.exception ? "retention" : e.request ? "policy" : "other";
}
