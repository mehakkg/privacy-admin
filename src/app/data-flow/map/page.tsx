import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, Notice, formatDate } from "@/components/ui";
import { FlowCanvas, type FlowNode, type FlowEdge } from "@/components/FlowCanvas";
import { decodeList } from "@/lib/codec/json";
import { sourceStatus, SOURCE_STATUS_LABEL, SOURCE_KIND_LABEL } from "@/lib/sources";
import { isCrossBorderUnreviewed } from "@/lib/processingActivity";

export const dynamic = "force-dynamic";

type NodeWithRefs = Awaited<ReturnType<typeof loadNodes>>[number];
function loadNodes() {
  return db.dataFlowNode.findMany({ include: { source: true, processor: true } });
}

/**
 * The real profile behind a node, pulled from its linked record — so viewing a
 * source's status or a processor's DPA never means leaving this screen. Labels
 * are reused verbatim from the Sources screen so the two never diverge.
 * Touchpoint / unlinked nodes return null and the drawer simply omits the section.
 */
function buildProfile(n: NodeWithRefs): Record<string, string> | null {
  if (n.processor) {
    const p = n.processor;
    return {
      "DPA status": p.dpaStatus === "draft" ? "Draft — not yet valid" : "Active",
      Risk: p.riskClassification ? p.riskClassification[0].toUpperCase() + p.riskClassification.slice(1) : "Not classified",
      "DPA expires": p.dpaExpiresAt ? formatDate(p.dpaExpiresAt) : "—",
      Health: p.healthStatus[0].toUpperCase() + p.healthStatus.slice(1),
    };
  }
  if (n.source) {
    const s = n.source;
    return {
      Status: SOURCE_STATUS_LABEL[sourceStatus(s)],
      Kind: SOURCE_KIND_LABEL[s.kind] ?? s.kind,
      "Last scanned": s.lastScanned ? formatDate(s.lastScanned) : "Never",
    };
  }
  return null;
}

/** A record exists behind this node → offer a secondary "manage in full" link
 *  for the editing that genuinely doesn't belong in a side drawer. */
function manageLink(n: NodeWithRefs): { href: string; label: string } | null {
  if (n.source) return { href: `/discovery/sources/${n.source.id}`, label: "Manage in Sources →" };
  if (n.processor) return { href: "/vendor-risk/vendors", label: "Manage in Vendor Risk →" };
  return null;
}

/**
 * SCREEN 1 — Flow Map.
 *
 * The one genuinely diagrammatic screen in the product: a flow reads better as
 * a graph than as rows. Nodes are generated from the connected estate; the
 * point of the screen is that an undisclosed transfer (red dashed edge) shows
 * up without anyone going looking for it.
 */
export default async function FlowMapPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string; entity?: string; view?: string }>;
}) {
  const params = await searchParams;
  // Exception-first: default to the risk view (undisclosed or cross-border only);
  // full topology is an explicit opt-in for genuine architecture review.
  const view = params.view === "full" ? "full" : "risk";

  const [nodesRaw, edgesRaw, purposes, processors, entities] = await Promise.all([
    loadNodes(),
    db.dataFlowConnection.findMany({ include: { purposeTag: true } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.dataProcessor.findMany(),
    db.entity.findMany(),
  ]);

  const procName = new Map(processors.map((p) => [p.id, p.name]));
  const procJurisdiction = new Map(processors.map((p) => [p.id, p.jurisdiction]));
  const edgeCrossBorder = (processorId: string | null | undefined) =>
    processorId ? isCrossBorderUnreviewed(procJurisdiction.get(processorId) ?? null) : false;

  let nodes: FlowNode[] = nodesRaw.map((n) => ({
    id: n.id,
    label: n.label,
    nodeType: n.nodeType as FlowNode["nodeType"],
    subtitle: n.subtitle,
    profile: buildProfile(n),
    manage: manageLink(n),
  }));

  let edges: FlowEdge[] = edgesRaw.map((e) => ({
    id: e.id,
    fromId: e.fromNodeId,
    toId: e.toNodeId,
    categories: decodeList(e.dataCategoriesJson),
    purpose: e.purposeTag?.name ?? null,
    dpiaRef: e.dpiaRef,
    processorName: e.processorId ? (procName.get(e.processorId) ?? null) : null,
    status: e.status as "documented" | "undisclosed",
    crossBorder: edgeCrossBorder(e.processorId),
    manual: e.manual,
  }));

  // Risk view: show only flagged connections (undisclosed OR cross-border).
  if (view === "risk") edges = edges.filter((e) => e.status === "undisclosed" || e.crossBorder);
  // Filters narrow the edges shown; nodes with no remaining edge drop out.
  if (params.status === "undisclosed") edges = edges.filter((e) => e.status === "undisclosed");
  if (params.status === "documented") edges = edges.filter((e) => e.status === "documented");
  if (params.category) edges = edges.filter((e) => e.categories.includes(params.category!));
  const term = (params.q ?? "").trim().toLowerCase();
  if (term) {
    const keepNodes = new Set(nodes.filter((n) => n.label.toLowerCase().includes(term)).map((n) => n.id));
    edges = edges.filter((e) => keepNodes.has(e.fromId) || keepNodes.has(e.toId));
  }

  // Drop nodes with no remaining edge so an orphan doesn't float over the canvas.
  const anyFilter = view === "risk" || Boolean(params.status || params.category || term);
  if (anyFilter) {
    const connected = new Set(edges.flatMap((e) => [e.fromId, e.toId]));
    nodes = nodes.filter((n) => connected.has(n.id));
  }

  const undisclosed = edgesRaw.filter((e) => e.status === "undisclosed").length;
  const crossBorder = edgesRaw.filter((e) => edgeCrossBorder(e.processorId)).length;
  const flaggedTotal = edgesRaw.filter((e) => e.status === "undisclosed" || edgeCrossBorder(e.processorId)).length;

  return (
    <Shell active="/data-flow" title="Data Flow / Flow map">
      <PageHead
        title="Flow map"
        titleTip="Defaults to a risk view — only undisclosed or cross-border connections. Toggle to the full topology for architecture review."
        actions={
          <div className="row" style={{ gap: 4 }}>
            <Link href="/data-flow/map" className={`btn xs ${view === "risk" ? "primary" : "ghost"}`}>Risk view</Link>
            <Link href="/data-flow/map?view=full" className={`btn xs ${view === "full" ? "primary" : "ghost"}`}>Full topology</Link>
          </div>
        }
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Nodes" value={nodesRaw.length} />
        <Stat label="Flows" value={edgesRaw.length} />
        <Stat label="Undisclosed" value={undisclosed} tone={undisclosed ? "red" : undefined} />
        <Stat label="Cross-border" value={crossBorder} tone={crossBorder ? "yellow" : undefined} />
      </div>

      {view === "risk" && flaggedTotal === 0 && (
        <Notice tone="ok" title="No undisclosed or cross-border connections detected">
          Every connection has a recorded purpose/DPIA and stays within a notified jurisdiction. Switch to Full topology for architecture review.
        </Notice>
      )}

      <CompactFilterBar
        basePath="/data-flow/map"
        searchPlaceholder="Search nodes…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "documented", label: "Documented" },
              { value: "undisclosed", label: "Undisclosed" },
            ],
          },
          {
            key: "category",
            label: "Data category",
            options: ["identity", "contact", "kyc", "financial", "transaction", "marketing", "behavioural", "support"].map((c) => ({ value: c, label: c })),
          },
          // Entity only meaningful once >1 entity exists.
          ...(entities.length > 1
            ? [{ key: "entity", label: "Entity", options: entities.map((e) => ({ value: e.id, label: e.name })) }]
            : []),
        ]}
      />

      <FlowCanvas
        nodes={nodes}
        edges={edges}
        dpias={["DPIA-2025-004", "DPIA-2026-011", "DPIA-2026-018"]}
        categories={["identity", "contact", "kyc", "financial", "transaction", "marketing", "behavioural", "support"]}
        purposes={purposes.map((p) => ({ id: p.id, name: p.name }))}
      />
    </Shell>
  );
}
