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
import { TprmToggle, ImportProcessorButton } from "@/components/tprmIntegration";
import { ratingScore, type TprmSummary } from "@/lib/tprm";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

type VendorWithAssessments = {
  id: string; name: string; riskRating: string;
  assessments: { legalReviewStatus: string; classification: string | null; classificationReason: string | null }[];
};

/** A read-only TPRM summary pulled from the linked Vendor (Screen 3 source). */
function summarize(vendor: VendorWithAssessments): TprmSummary {
  const verified = vendor.assessments.filter((a) => a.legalReviewStatus === "verified");
  const latest = verified[0];
  const status: TprmSummary["status"] = verified.length ? "verified" : vendor.assessments.length ? "pending" : "none";
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    riskRating: vendor.riskRating,
    score: status === "verified" ? ratingScore(latest?.classification ?? vendor.riskRating) : null,
    status,
    openFindings: vendor.assessments.filter((a) => a.legalReviewStatus !== "verified").length,
    latestFinding: status === "pending" ? "Assessment pending review in TPRM." : (latest?.classificationReason ?? null),
    lastSynced: nowStamp(),
  };
}

/**
 * SCREEN 2 (Data Processors) — with the TPRM integration, Processor records
 * import from TPRM Vendors and carry a live-pulled TPRM assessment panel; vendor-
 * level data is never re-entered here.
 */
export default async function DataProcessorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const [processors, config, vendors] = await Promise.all([
    db.dataProcessor.findMany({
      include: {
        executions: { include: { request: true }, orderBy: { dispatchedAt: "desc" } },
        vendor: { include: { assessments: { orderBy: { assignedAt: "desc" }, select: { legalReviewStatus: true, classification: true, classificationReason: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    db.integrationConfig.findUnique({ where: { id: "singleton" } }),
    db.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, category: true, riskRating: true } }),
  ]);

  const enabled = Boolean(config?.tprmEnabled);
  const linkedCount = processors.filter((p) => p.vendorId).length;

  let rows: ProcessorRow[] = processors.map((p) => {
    const instructions: InstructionEntry[] = p.executions.map((e) => ({
      ref: e.request?.referenceCode ?? "—",
      status: e.status as InstructionEntry["status"],
      at: e.dispatchedAt ?? e.createdAt,
      detail: e.failureDetail ?? null,
    }));
    let subProcessors: SubProcessor[] = [];
    try { const parsed = JSON.parse(p.subProcessorsJson); if (Array.isArray(parsed)) subProcessors = parsed as SubProcessor[]; } catch { /* ignore */ }
    const lastInstructionAt = p.executions.map((e) => e.dispatchedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    let tprm: TprmSummary | null = null;
    if (p.vendorId) {
      tprm = p.vendor
        ? summarize(p.vendor as VendorWithAssessments)
        : { vendorId: p.vendorId, vendorName: "—", riskRating: "medium", score: null, status: "none", openFindings: 0, latestFinding: null, lastSynced: nowStamp(), broken: true };
    }

    return {
      id: p.id, name: p.name, dpaId: p.dpaId, dpaStatus: p.dpaStatus as "active" | "draft",
      contactChannel: p.contactChannel, riskClassification: p.riskClassification, contractDate: p.contractDate,
      dpaScope: decodeList(p.dpaScopeJson), lastInstructionAt, instructions, subProcessors,
      vendorId: p.vendorId, tprm,
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

      <TprmToggle enabled={enabled} linkedCount={linkedCount} />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Processors" value={processors.length} />
        <Stat label="Draft — DPA pending" value={draft} tone={draft ? "yellow" : undefined} />
        <Stat label="Linked to TPRM" value={linkedCount} />
      </div>

      <CompactFilterBar
        basePath="/integrations/data-processors"
        searchKey="q"
        searchPlaceholder="Search processors…"
        facets={[
          { key: "status", label: "Status", options: [
            { value: "active", label: "Active" }, { value: "draft", label: "Draft — DPA pending" },
          ] },
        ]}
        actions={enabled ? <ImportProcessorButton vendors={vendors} /> : undefined}
      />

      <DataProcessorsTable rows={rows} />
    </Shell>
  );
}
