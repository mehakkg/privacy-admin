import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead, Stat } from "@/components/ui";
import { FlowCanvas, type FlowNode, type FlowEdge } from "@/components/FlowCanvas";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ status?: string; category?: string; q?: string; entity?: string }>;
}) {
  const params = await searchParams;

  const [nodesRaw, edgesRaw, purposes, processors, entities, flaggedSubprocessors] = await Promise.all([
    db.dataFlowNode.findMany(),
    db.dataFlowConnection.findMany({ include: { purposeTag: true } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.dataProcessor.findMany(),
    db.entity.findMany(),
    db.subProcessorDisclosure.count({ where: { detected: true, flagStatus: { not: "resolved" } } }),
  ]);

  const procName = new Map(processors.map((p) => [p.id, p.name]));

  let nodes: FlowNode[] = nodesRaw.map((n) => ({
    id: n.id,
    label: n.label,
    nodeType: n.nodeType as FlowNode["nodeType"],
    subtitle: n.subtitle,
    refHref: n.refHref,
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
    manual: e.manual,
  }));

  // Filters narrow the edges shown; nodes with no remaining edge drop out.
  if (params.status === "undisclosed") edges = edges.filter((e) => e.status === "undisclosed");
  if (params.status === "documented") edges = edges.filter((e) => e.status === "documented");
  if (params.category) edges = edges.filter((e) => e.categories.includes(params.category!));
  const term = (params.q ?? "").trim().toLowerCase();
  if (term) {
    const keepNodes = new Set(nodes.filter((n) => n.label.toLowerCase().includes(term)).map((n) => n.id));
    edges = edges.filter((e) => keepNodes.has(e.fromId) || keepNodes.has(e.toId));
  }

  // Once any edge filter is applied, drop nodes that no longer have an edge —
  // otherwise an orphaned node floats over the remaining edges and both
  // clutters the canvas and steals their click target.
  const anyFilter = Boolean(params.status || params.category || term);
  if (anyFilter) {
    const connected = new Set(edges.flatMap((e) => [e.fromId, e.toId]));
    nodes = nodes.filter((n) => connected.has(n.id));
  }

  const undisclosed = edgesRaw.filter((e) => e.status === "undisclosed").length;

  return (
    <Shell active="/data-flow" title="Data Flow / Flow map">
      <PageHead
        title="Flow map"
        titleTip="Auto-generated from your connected sources and integrations. Undisclosed connections — detected transfers with no recorded purpose or DPIA — are flagged in red."
      />

      {flaggedSubprocessors > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger" title="Undisclosed sub-processor transfer detected">
            {flaggedSubprocessors} data destination{flaggedSubprocessors === 1 ? "" : "s"} match no registered vendor or approved sub-processor disclosure.{" "}
            <Link href="/vendor-risk/sub-processor-disclosures/flagged" className="row-link">Review in Vendor Risk →</Link>
          </Notice>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Nodes" value={nodesRaw.length} />
        <Stat label="Flows" value={edgesRaw.length} />
        <Stat label="Undisclosed" value={undisclosed} tone={undisclosed ? "red" : undefined} />
      </div>

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
