import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import {
  Card,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { decodeObject } from "@/lib/codec/json";
import {
  ESCALATION_RULING_LABEL,
  ROLE_LABEL,
  type ActorRole,
  type EscalationRuling,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * ESCALATIONS QUEUE (Scenario 3)
 *
 * One shared case type, three sources: retention conflicts from rights
 * fulfilment, failure disputes, and RBAC baseline requests. Building three
 * separate escalation mechanisms would mean three queues nobody watches; this
 * is one place to look.
 *
 * Admin raises and tracks. Admin does not rule — the ruling controls live in
 * the Governance portal, and the guards refuse an admin-role actor writing a
 * ruling regardless of what any screen offers.
 */

type StatusFilter = "open" | "ruled" | "closed";

const STATUS_TO_DB: Record<StatusFilter, string> = {
  open: "open",
  ruled: "ruled",
  closed: "withdrawn",
};

export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = (params.status as StatusFilter | undefined) ?? "open";

  const [all, escalations] = await Promise.all([
    db.escalation.findMany({ select: { status: true, targetRole: true } }),
    db.escalation.findMany({
      where: { status: STATUS_TO_DB[filter] ?? "open" },
      include: { request: true, exception: true, ruledBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const open = all.filter((e) => e.status === "open").length;
  const ruled = all.filter((e) => e.status === "ruled").length;
  const closed = all.filter((e) => e.status === "withdrawn").length;
  const toDpo = all.filter((e) => e.status === "open" && e.targetRole === "dpo").length;
  const toCiso = all.filter((e) => e.status === "open" && e.targetRole === "ciso").length;

  const now = Date.now();

  return (
    <Shell active="/escalations" title="Escalations">
      <div className="stack">
        <PageHead
          title="Escalations"
        subtitle="Conflicts Admin cannot resolve alone. Raised with full context attached, tracked until a documented ruling comes back."
      />

      <div className="stat-row">
        <Stat label="Open" value={open} tone={open ? "yellow" : undefined} />
        <Stat label="Awaiting DPO" value={toDpo} />
        <Stat label="Awaiting CISO" value={toCiso} />
        <Stat label="Ruled" value={ruled} />
        <Stat label="Closed" value={closed} />
      </div>

      <Notice tone="info" title="Admin raises; Governance rules">
        A technical action that collides with a governance rule stops here rather
        than being decided at the console. Admin cannot record a ruling — the
        server refuses it — so an override always carries a documented decision
        from the person accountable for it.
      </Notice>

      <div className="row" style={{ marginBottom: 4 }}>
        <span className="section-label" style={{ margin: 0 }}>
          Filter
        </span>
        <FilterLink label={`Open (${open})`} href="/escalations?status=open" active={filter === "open"} />
        <FilterLink label={`Ruled (${ruled})`} href="/escalations?status=ruled" active={filter === "ruled"} />
        <FilterLink label={`Closed (${closed})`} href="/escalations?status=closed" active={filter === "closed"} />
      </div>

        <Card title={`${filter[0].toUpperCase()}${filter.slice(1)} escalations`}>
        {escalations.length === 0 ? (
          <div className="empty">
            <p style={{ margin: "0 0 10px" }}>
              No {filter} escalations.
            </p>
            <Link href="/requests" className="btn primary sm">
              Go to the request queue
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Raised</th>
                  <th>About</th>
                  <th>Reason</th>
                  <th>With</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((e) => {
                  const context = decodeObject<Record<string, unknown>>(e.contextJson) ?? {};
                  const ageDays = Math.floor(
                    (now - e.createdAt.getTime()) / (24 * 60 * 60 * 1000),
                  );

                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="cell-stack">
                          <Link href={`/escalations/${e.id}`} className="row-link">
                            {formatDate(e.createdAt)}
                          </Link>
                          <span className="cell-sub">
                            {ageDays === 0 ? "today" : `${ageDays}d ago`} · by{" "}
                            {ROLE_LABEL[e.sourceRole as ActorRole]}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          {e.request ? (
                            <Link
                              href={`/requests/${e.requestId}`}
                              className="row-link mono"
                            >
                              {e.request.referenceCode}
                            </Link>
                          ) : (
                            <span className="cell-primary">
                              {String(context.role ?? "Role baseline")}
                            </span>
                          )}
                          <span className="cell-sub">
                            {e.exception
                              ? `${e.exception.dataCategory} retention`
                              : e.request
                                ? "Execution conflict"
                                : "RBAC baseline"}
                          </span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <span className="cell-sub">
                          {e.reason.length > 150
                            ? `${e.reason.slice(0, 150)}…`
                            : e.reason}
                        </span>
                      </td>
                      <td>
                        <Pill tone={e.targetRole === "ciso" ? "purple" : "blue"}>
                          {ROLE_LABEL[e.targetRole as ActorRole]}
                        </Pill>
                      </td>
                      <td>
                        <div className="cell-stack">
                          {e.status === "open" && (
                            <>
                              <Pill tone="yellow">Pending ruling</Pill>
                              <span className="cell-sub">
                                waiting {ageDays}d
                              </span>
                            </>
                          )}
                          {e.status === "ruled" && (
                            <>
                              <Pill tone="green">Ruled</Pill>
                              <span className="cell-sub">
                                {e.ruling
                                  ? ESCALATION_RULING_LABEL[e.ruling as EscalationRuling]
                                  : ""}
                              </span>
                              <span className="cell-sub">
                                {e.ruledBy?.name} · {formatDateTime(e.ruledAt)}
                              </span>
                            </>
                          )}
                          {e.status === "withdrawn" && (
                            <>
                              <Pill tone="gray">Closed</Pill>
                              <span className="cell-sub">withdrawn by Admin</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </Card>
      </div>
    </Shell>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={`btn sm ${active ? "primary" : "ghost"}`}>
      {label}
    </Link>
  );
}
