import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat } from "@/components/ui";
import {
  DataProcessorsTable,
  type ProcessorRow,
  type InstructionEntry,
  type SubProcessor,
} from "@/components/dataProcessors";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 — Data Processors.
 *
 * The registry that closes Task 6 (Critical): Admin now has a real way to
 * instruct a third-party processor, gated by whether a valid DPA exists. A
 * draft-DPA processor is a hard block on dispatch (enforced at the execution
 * point via guards/processorGate.ts), not merely a status label here.
 */
export default async function DataProcessorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const processors = await db.dataProcessor.findMany({
    include: {
      executions: { include: { request: true }, orderBy: { dispatchedAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  let rows: ProcessorRow[] = processors.map((p) => {
    const instructions: InstructionEntry[] = p.executions.map((e) => ({
      ref: e.request?.referenceCode ?? "—",
      status: e.status as InstructionEntry["status"],
      at: e.dispatchedAt ?? e.createdAt,
      detail: e.failureDetail ?? null,
    }));
    let subProcessors: SubProcessor[] = [];
    try {
      const parsed = JSON.parse(p.subProcessorsJson);
      if (Array.isArray(parsed)) subProcessors = parsed as SubProcessor[];
    } catch {
      /* ignore */
    }
    const lastInstructionAt = p.executions
      .map((e) => e.dispatchedAt)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      id: p.id,
      name: p.name,
      dpaId: p.dpaId,
      dpaStatus: p.dpaStatus as "active" | "draft",
      contactChannel: p.contactChannel,
      riskClassification: p.riskClassification,
      contractDate: p.contractDate,
      dpaScope: decodeList(p.dpaScopeJson),
      lastInstructionAt,
      instructions,
      subProcessors,
    };
  });

  if (params.status === "active") rows = rows.filter((r) => r.dpaStatus === "active");
  if (params.status === "draft") rows = rows.filter((r) => r.dpaStatus === "draft");
  if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));

  const draft = processors.filter((p) => p.dpaStatus === "draft").length;

  return (
    <Shell active="/integrations/data-processors" title="Integrations / Data processors">
      <PageHead
        title="Data processors"
        titleTip="Third-party processors you can instruct to delete or return personal data. A processor cannot receive a live instruction until a valid DPA exists (DPDP s.8(2))."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Processors" value={processors.length} />
        <Stat label="Draft — DPA pending" value={draft} tone={draft ? "yellow" : undefined} />
        <Stat label="Active" value={processors.length - draft} />
      </div>

      <CompactFilterBar
        basePath="/integrations/data-processors"
        searchKey="q"
        searchPlaceholder="Search processors…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "draft", label: "Draft — DPA pending" },
            ],
          },
        ]}
      />

      <DataProcessorsTable rows={rows} />
    </Shell>
  );
}
