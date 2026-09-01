import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat } from "@/components/ui";
import {
  ConnectedSystemsTable,
  type SystemRow,
} from "@/components/connectedSystems";
import { REQUEST_TYPE_LABEL, REQUEST_STATUS_LABEL, type RequestType, type RequestStatus } from "@/lib/domain";
import type { PillTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  database: "Database",
  cloud_storage: "Cloud storage",
  saas: "SaaS tool",
  file_share: "File share",
  crm: "CRM",
  archive: "Archive",
  backup: "Backup",
  other: "Other",
};

const CLOSED_STATUSES = new Set(["closed", "completed", "rejected", "fulfilled"]);

/** Map a raw connection state to the screen's Connected / Disconnected / Error. */
function statusOf(execState: string | null, scanState: string): { label: string; tone: PillTone; key: string } {
  const s = execState ?? scanState;
  switch (s) {
    case "healthy":
    case "connected":
      return { label: "Connected", tone: "green", key: "connected" };
    case "connected_no_data":
      return { label: "Connected", tone: "green", key: "connected" };
    case "manual_only":
      return { label: "Manual only", tone: "gray", key: "connected" };
    case "degraded":
      return { label: "Degraded", tone: "yellow", key: "error" };
    case "down":
    case "failed":
      return { label: "Error", tone: "red", key: "error" };
    case "untested":
      return { label: "Untested", tone: "gray", key: "disconnected" };
    default:
      return { label: s, tone: "gray", key: "disconnected" };
  }
}

/**
 * SCREEN 1 — Connected Systems.
 *
 * A purpose-scoped VIEW of the same registry Data Discovery's Sources manages,
 * filtered to systems flagged as execution targets — NOT a second "add a system"
 * flow. Adding here creates the same DiscoverySource record Sources uses.
 */
export default async function ConnectedSystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; role?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const [sources, execRecords] = await Promise.all([
    db.discoverySource.findMany({
      include: { connectedSystem: true },
      orderBy: { name: "asc" },
    }),
    db.executionRecord.findMany({
      where: { systemId: { not: null } },
      include: { request: true },
    }),
  ]);

  // Open requests referencing each ConnectedSystem as an execution target.
  const refsBySystem = new Map<string, { ref: string; typeLabel: string; statusLabel: string }[]>();
  for (const er of execRecords) {
    if (!er.systemId || !er.request) continue;
    if (CLOSED_STATUSES.has(er.request.status)) continue;
    const list = refsBySystem.get(er.systemId) ?? [];
    if (!list.some((x) => x.ref === er.request.referenceCode)) {
      list.push({
        ref: er.request.referenceCode,
        typeLabel: REQUEST_TYPE_LABEL[er.request.type as RequestType] ?? er.request.type,
        statusLabel: REQUEST_STATUS_LABEL[er.request.status as RequestStatus] ?? er.request.status,
      });
    }
    refsBySystem.set(er.systemId, list);
  }

  let rows: SystemRow[] = sources.map((s) => {
    const status = statusOf(s.connectedSystem?.connectionStatus ?? null, s.connectionState);
    const referencedBy = s.connectedSystemId ? (refsBySystem.get(s.connectedSystemId) ?? []) : [];
    return {
      id: s.id,
      name: s.name,
      kindLabel: KIND_LABEL[s.kind] ?? s.kind,
      scanTarget: s.availableAsScanTarget,
      execTarget: s.availableAsExecutionTarget,
      statusLabel: status.label,
      statusTone: status.tone,
      lastVerifiedAt: s.connectedSystem?.lastVerifiedAt ?? s.lastScanned ?? null,
      usedByCount: referencedBy.length,
      sourceHref: `/discovery/sources/${s.id}`,
      referencedBy,
      _statusKey: status.key,
    } as SystemRow & { _statusKey: string };
  });

  if (params.status) rows = rows.filter((r) => (r as SystemRow & { _statusKey: string })._statusKey === params.status);
  if (params.role) {
    rows = rows.filter((r) => {
      const both = r.scanTarget && r.execTarget;
      if (params.role === "both") return both;
      if (params.role === "execution") return r.execTarget && !r.scanTarget;
      if (params.role === "scan") return r.scanTarget && !r.execTarget;
      return true;
    });
  }
  if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));

  const execTargets = sources.filter((s) => s.availableAsExecutionTarget).length;
  const errored = sources.filter((s) => {
    const st = statusOf(s.connectedSystem?.connectionStatus ?? null, s.connectionState);
    return st.key === "error";
  }).length;

  return (
    <Shell active="/integrations/connected-systems" title="Integrations / Connected systems">
      <PageHead
        title="Connected systems"
        titleTip="This is the same system registry as Data Discovery's Sources, filtered to systems that can receive execution instructions."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Systems" value={sources.length} />
        <Stat label="Execution targets" value={execTargets} />
        <Stat label="Errors" value={errored} tone={errored ? "red" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/integrations/connected-systems"
        searchKey="q"
        searchPlaceholder="Search systems…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "connected", label: "Connected" },
              { value: "disconnected", label: "Disconnected" },
              { value: "error", label: "Error" },
            ],
          },
          {
            key: "role",
            label: "Role",
            options: [
              { value: "scan", label: "Scan target" },
              { value: "execution", label: "Execution target" },
              { value: "both", label: "Both" },
            ],
          },
        ]}
      />

      <ConnectedSystemsTable rows={rows} />
    </Shell>
  );
}
