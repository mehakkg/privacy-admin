import { db } from "@/lib/db";
import { Card, Notice, PageHead, Pill, Stat } from "@/components/ui";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import {
  ProvisioningQueue,
  type ProvRequestRow,
  type ProvSystemRow,
} from "@/components/provisioning";
import { analyseGrant, decodeProvSystems } from "@/lib/engines/access";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 (Scenario 2) — Provisioning
 *
 * The queue of access requests awaiting a grant. The default path always starts
 * from a least-privilege template; broadening beyond it is the exception, and
 * the exception is visibly flagged and requires a recorded reason. A grant is
 * executed per-system with the same three-state (pending / granted / failed)
 * language as Request execution, so a partial or failed grant is never
 * collapsed into a single "done".
 */
export default async function ProvisioningPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const [requests, grants] = await Promise.all([
    db.provisioningRequest.findMany({ orderBy: { requestedAt: "desc" } }),
    db.accessGrant.findMany({
      where: { revokedAt: null },
      include: { account: { include: { user: true, system: true } }, role: true },
    }),
  ]);

  let rows: ProvRequestRow[] = requests.map((r) => ({
    id: r.id,
    requesterName: r.requesterName,
    requesterDept: r.requesterDept,
    source: r.source as ProvRequestRow["source"],
    roleRequested: r.roleRequested,
    status: r.status as ProvRequestRow["status"],
    requestedAt: r.requestedAt,
    systems: decodeProvSystems(r.systemsJson) as ProvSystemRow[],
    broadenedJustification: r.broadenedJustification,
  }));

  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.source) rows = rows.filter((r) => r.source === params.source);
  if (term) rows = rows.filter((r) => r.requesterName.toLowerCase().includes(term));

  const pending = requests.filter((r) => r.status === "pending").length;
  const failed = requests.filter((r) => r.status === "failed").length;

  // Existing live grants that reach outside their role's baseline. These predate
  // the point-of-grant refusal and are surfaced here rather than left for an
  // annual review to find.
  const overBroad = grants
    .map((g) => ({ g, a: analyseGrant(g, g.role) }))
    .filter((x) => x.a.overBroad);

  return (
    <div className="stack">
      <PageHead
        title="Provisioning"
        titleTip="Grant scoped access from least-privilege role templates. Broadening beyond the template is the exception, is flagged, and requires a recorded reason."
      />

      <div className="stat-row">
        <Stat label="Requests" value={requests.length} />
        <Stat label="Pending" value={pending} tone={pending ? "yellow" : undefined} />
        <Stat label="Failed grants" value={failed} tone={failed ? "red" : undefined} />
        <Stat
          label="Over-broad live grants"
          value={overBroad.length}
          tone={overBroad.length ? "red" : undefined}
        />
      </div>

      <CompactFilterBar
        basePath="/access/provisioning"
        searchKey="q"
        searchPlaceholder="Search by requester…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "pending", label: "Pending" },
              { value: "granted", label: "Granted" },
              { value: "failed", label: "Failed" },
            ],
          },
          {
            key: "source",
            label: "Source",
            options: [
              { value: "hr_sync", label: "HR sync" },
              { value: "manual", label: "Manual request" },
            ],
          },
        ]}
      />

      <ProvisioningQueue rows={rows} />

      {overBroad.length > 0 && (
        <Notice
          tone="danger"
          title={`${overBroad.length} live grant${overBroad.length === 1 ? "" : "s"} reach data outside the role's baseline`}
        >
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {overBroad.map(({ g, a }) => (
              <li key={g.id} style={{ marginBottom: 3 }}>
                <strong>{g.account.user.fullName}</strong> on {g.account.system.name} holds{" "}
                <em>{a.roleName}</em> reaching <strong>{a.excessCategories.join(", ")}</strong>,
                which the role&apos;s baseline does not cover.
              </li>
            ))}
          </ul>
          <p style={{ margin: "8px 0 0" }}>
            New grants like these are refused at the point of granting. These predate
            that check and need narrowing.
          </p>
        </Notice>
      )}

      <Card title="Templates enforce least privilege by default">
        <p className="cell-sub" style={{ margin: 0 }}>
          Every request is granted from a named least-privilege template — the
          product no longer leaves each grant as a manual, error-prone decision.
          Broadening beyond a template is possible, but it is the exception:{" "}
          <Pill tone="yellow">Broadened</Pill> marks it in the queue and a reason is
          recorded against the grant.
        </p>
      </Card>
    </div>
  );
}
