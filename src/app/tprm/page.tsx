import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { Donut, Ring, RankedList } from "@/components/viz";
import { TprmMindMap, type MindMapProcessor } from "@/components/tprmMindMap";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const CLOSED = new Set(["closed", "completed", "rejected", "fulfilled"]);
const RISK_COLOR: Record<string, string> = { low: "var(--green)", medium: "var(--yellow)", high: "var(--red)", critical: "var(--red)" };

/**
 * TPRM DASHBOARD — Legal/Procurement's home screen. A read-only lens over the
 * Integrations Data Processor registry: it adds a risk/assessment/SLA/cross-
 * module layer on top of that one canonical record, never a parallel vendor
 * database. Reached only via "Acting as: Legal".
 */
export default async function TprmDashboardPage() {
  const now = Date.now();

  const [processors, escalations, disclosures, assessments, flows] = await Promise.all([
    db.dataProcessor.findMany({
      include: {
        executions: { include: { request: true } },
        vendor: { include: { purposeMappings: true, assessments: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.escalation.findMany({ where: { targetRole: "legal", status: "open" } }),
    db.subProcessorDisclosure.findMany({ include: { primaryVendor: true } }),
    db.vendorAssessment.findMany(),
    // Flow-map connections already carry processor → PII categories → purpose —
    // the right source for the mind-map, far richer than the vendor links alone.
    db.dataFlowConnection.findMany({ where: { processorId: { not: null } }, include: { purposeTag: true } }),
  ]);

  const daysToExpiry = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / DAY) : null);

  // --- Portfolio health -----------------------------------------------------
  const draftDpa = processors.filter((p) => p.dpaStatus === "draft");
  const active = processors.filter((p) => p.dpaStatus === "active");
  const flaggedIds = new Set(disclosures.filter((d) => d.status === "flagged" && d.flagStatus !== "resolved").map((d) => d.primaryVendorId));
  const flaggedNonCompliant = processors.filter((p) => (p.vendorId && flaggedIds.has(p.vendorId))).length;
  const expiring = (win: number) => active.filter((p) => { const d = daysToExpiry(p.dpaExpiresAt); return d !== null && d >= 0 && d <= win; });

  // --- Risk distribution ----------------------------------------------------
  const riskCount = (r: string) => processors.filter((p) => (p.riskClassification ?? "").toLowerCase() === r).length;
  const assessComplete = assessments.filter((a) => a.legalReviewStatus === "verified").length;
  const assessInProgress = assessments.filter((a) => a.legalReviewStatus === "partial").length;
  const assessNotStarted = assessments.filter((a) => a.legalReviewStatus === "pending").length;

  // --- Contract & DPA health ------------------------------------------------
  const expired = processors.filter((p) => { const d = daysToExpiry(p.dpaExpiresAt); return d !== null && d < 0; }).length;
  const nearingExpiry = active
    .map((p) => ({ p, d: daysToExpiry(p.dpaExpiresAt) }))
    .filter((x) => x.d !== null)
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
    .slice(0, 5)
    .map((x) => ({ name: x.p.name, note: x.d! < 0 ? `${-x.d!}d overdue` : `${x.d}d left`, tone: (x.d! < 30 ? "red" : "yellow") as "red" | "yellow", href: "/integrations/data-processors" }));
  const reviewed = processors.filter((p) => p.contractDate).length;
  const liabilityPct = processors.length ? Math.round((reviewed / processors.length) * 100) : 0;

  // --- SLA & performance ----------------------------------------------------
  const allExec = processors.flatMap((p) => p.executions);
  const verified = allExec.filter((e) => e.status === "verified").length;
  const failed = allExec.filter((e) => e.status === "failed").length;
  const slaPct = verified + failed ? Math.round((verified / (verified + failed)) * 100) : 100; // aggregate, kept as the top-level number

  // Per-vendor, per-obligation clock. An obligation is late when an instruction
  // was dispatched but not acknowledged within the contractual window, or failed
  // outright — labelled by what it actually is (deletion ack, access ack, …),
  // not collapsed into one failure count.
  const ACK_WINDOW = 7; // contractual acknowledgment window, days
  const obligationLabel = (reqType?: string, mode?: string) =>
    reqType === "erasure" ? "deletion acknowledgment"
    : reqType === "access" ? "access acknowledgment"
    : reqType === "correction" ? "correction acknowledgment"
    : reqType === "nomination" ? "nomination acknowledgment"
    : mode === "processor_instruction" ? "instruction acknowledgment"
    : "evidence submission";
  const breaching = processors
    .map((p) => {
      const breaches = p.executions.flatMap((e) => {
        const obligation = obligationLabel(e.request?.type, e.mode);
        if (e.status === "failed") return [{ obligation, overdueDays: 0, failed: true }];
        const acknowledged = e.status === "verified" || Boolean(e.confirmedAt);
        if (!acknowledged && e.dispatchedAt) {
          const overdueDays = Math.floor((now - e.dispatchedAt.getTime()) / DAY) - ACK_WINDOW;
          if (overdueDays > 0) return [{ obligation, overdueDays, failed: false }];
        }
        return [];
      });
      return { p, breaches };
    })
    .filter((x) => x.breaches.length > 0)
    .map((x) => {
      const worst = [...x.breaches].sort((a, b) => (b.overdueDays - a.overdueDays) || (Number(b.failed) - Number(a.failed)))[0];
      const note =
        (worst.failed && worst.overdueDays === 0 ? `failed on ${worst.obligation}` : `${worst.overdueDays} day${worst.overdueDays === 1 ? "" : "s"} overdue on ${worst.obligation}`) +
        (x.breaches.length > 1 ? ` (+${x.breaches.length - 1} more)` : "");
      return { name: x.p.name, note, tone: "red" as const, href: "/integrations/data-processors", sortKey: worst.failed ? 10000 : worst.overdueDays };
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ name, note, tone, href }) => ({ name, note, tone, href }));

  // --- Assessment lifecycle -------------------------------------------------
  const pendingResponse = assessments.filter((a) => a.vendorStatus !== "submitted").length;
  const overdue = assessments.filter((a) => a.vendorStatus !== "submitted" && (now - a.assignedAt.getTime()) / DAY > 14).length;
  const onboarding = new Set(assessments.filter((a) => a.legalReviewStatus !== "verified").map((a) => a.vendorId)).size;

  // --- Availability (cross-referenced from Health Monitoring) ----------------
  const unreachable = processors.filter((p) => p.healthStatus === "unreachable");
  const persistent = unreachable.filter((p) => p.unreachableSinceAt && (now - p.unreachableSinceAt.getTime()) / (60 * 60 * 1000) >= 48);

  // --- Sub-processor visibility ---------------------------------------------
  const subApproved = disclosures.filter((d) => d.status === "active").length;
  const subPending = disclosures.filter((d) => d.status === "held_pending_approval" || d.status === "pending_disclosure").length;
  const subFlagged = disclosures.filter((d) => d.status === "flagged" && d.flagStatus !== "resolved").length;

  // --- Cross-module signals -------------------------------------------------
  const reqTouching = processors
    .map((p) => ({ p, reqs: [...new Set(p.executions.filter((e) => e.request && !CLOSED.has(e.request.status)).map((e) => e.request!.referenceCode))] }))
    .filter((x) => x.reqs.length > 0);

  // --- Mind-map (processor → purpose → PII) ---------------------------------
  // Primary source: flow-map connections that name a processor and carry data
  // categories. Enriched with any linked-vendor purpose/PII mappings.
  const procName = new Map(processors.map((p) => [p.id, p.name]));
  const byProc = new Map<string, MindMapProcessor>();
  const add = (id: string, name: string, purpose: string, pii: string[]) => {
    const entry = byProc.get(id) ?? { id, name, links: [] };
    entry.links.push({ purpose, pii });
    byProc.set(id, entry);
  };
  for (const f of flows) {
    if (!f.processorId) continue;
    add(f.processorId, procName.get(f.processorId) ?? "Processor", f.purposeTag?.name ?? "Unassigned", decodeList(f.dataCategoriesJson));
  }
  for (const p of processors) {
    if (!p.vendor) continue;
    for (const m of p.vendor.purposeMappings) add(p.id, p.name, m.purposeName, decodeList(m.piiTypesJson));
  }
  const mindMap: MindMapProcessor[] = [...byProc.values()];

  // --- Action Needed --------------------------------------------------------
  const alerts: { severity: "red" | "yellow"; text: string; href: string; cta: string }[] = [];
  if (draftDpa.length) alerts.push({ severity: "red", text: `${draftDpa.length} processor(s) need a DPA reference before any instruction can be sent`, href: "/integrations/data-processors?status=draft", cta: "Draft-DPA list" });
  if (overdue) alerts.push({ severity: "red", text: `${overdue} assessment(s) overdue`, href: "/vendor-risk/assessments", cta: "Assessment queue" });
  if (expiring(30).length) alerts.push({ severity: "yellow", text: `${expiring(30).length} contract(s) expiring within 30 days`, href: "/vendor-risk/register?view=dpa", cta: "Contract list" });
  if (flaggedNonCompliant) alerts.push({ severity: "yellow", text: `${flaggedNonCompliant} processor(s) flagged non-compliant`, href: "/vendor-risk/sub-processor-disclosures/flagged", cta: "Flagged list" });

  return (
    <Shell active="/tprm" title="TPRM Dashboard">
      <PageHead
        title="TPRM Dashboard"
        titleTip="Legal & Procurement's home: portfolio risk, contract and SLA health, assessment lifecycle, and cross-module signals — a lens on the Data Processor registry, never a second copy of it."
      />

      {/* Portfolio health — hero + strip */}
      <div className="tprm-hero-row">
        <Link href="/integrations/data-processors?status=draft" className={`hero-card${draftDpa.length ? " danger" : " ok"}`}>
          <div className="hero-value">{draftDpa.length}</div>
          <div className="hero-label">Draft-DPA Processors</div>
          <div className="hero-sub">{draftDpa.length ? "Every one of these cannot receive a live instruction until a valid DPA reference is added." : "Every processor has a valid DPA — none are blocked from instruction."}</div>
          <div className="hero-link">Review draft-DPA processors →</div>
        </Link>
        <div className="tprm-hero-metrics">
          <Stat label="Active processors" value={active.length} />
          <Stat label="Flagged non-compliant" value={flaggedNonCompliant} tone={flaggedNonCompliant ? "red" : undefined} />
          <Stat label="Expiring ≤30d" value={expiring(30).length} tone={expiring(30).length ? "yellow" : undefined} />
          <Stat label="Expiring ≤60d" value={expiring(60).length} />
          <Stat label="Expiring ≤90d" value={expiring(90).length} />
        </div>
      </div>

      {/* Action Needed */}
      <Card title="Action needed">
        {alerts.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>Nothing needs Legal&rsquo;s attention right now.</p> : (
          <div className="stack" style={{ gap: 8 }}>
            {alerts.map((a, i) => (
              <div key={i} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className="row" style={{ gap: 8 }}><Pill tone={a.severity}>{a.severity === "red" ? "Blocking" : "Attention"}</Pill><span>{a.text}</span></span>
                <Link href={a.href} className="btn xs">{a.cta} →</Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title="Risk distribution">
          <Donut
            center={<span className="stat-value" style={{ fontSize: 16 }}>{processors.length}</span>}
            segments={[
              { label: "High", value: riskCount("high") + riskCount("critical"), color: "var(--red)", href: "/integrations/data-processors" },
              { label: "Medium", value: riskCount("medium"), color: "var(--yellow)", href: "/integrations/data-processors" },
              { label: "Low", value: riskCount("low"), color: "var(--green)", href: "/integrations/data-processors" },
            ]}
          />
          <div className="section-label">Assessment completion</div>
          <div className="stack" style={{ gap: 4 }}>
            <SplitBar a={assessComplete} b={assessInProgress} c={assessNotStarted} />
            <span className="cell-sub">{assessComplete} complete · {assessInProgress} in progress · {assessNotStarted} not started</span>
          </div>
        </Card>

        <Card title="Contract & DPA health">
          <Donut
            center={<span className="stat-value" style={{ fontSize: 16 }}>{processors.length}</span>}
            segments={[
              { label: "Active", value: active.length - expired, color: "var(--green)" },
              { label: "Draft-pending", value: draftDpa.length, color: "var(--yellow)" },
              { label: "Expired", value: expired, color: "var(--red)" },
            ]}
          />
          <div className="section-label">Contracts nearing expiry</div>
          <RankedList items={nearingExpiry} />
          <div className="section-label">Liability / indemnification review</div>
          <Ring pct={liabilityPct} tone="var(--accent)" label={`${reviewed}/${processors.length} reviewed against current DPDP exposure`} />
        </Card>

        <Card title="SLA & performance">
          <Ring pct={slaPct} tone="var(--green)" label="processor SLA compliance rate" />
          <div className="section-label">Currently breaching SLA</div>
          <RankedList items={breaching} />
        </Card>

        <Card title="Assessment lifecycle">
          <div className="stat-row">
            <Stat label="Pending vendor response" value={pendingResponse} tone={pendingResponse ? "yellow" : undefined} />
            <Stat label="Overdue" value={overdue} tone={overdue ? "red" : undefined} />
            <Stat label="Onboarding pipeline" value={onboarding} />
          </div>
          <Link href="/vendor-risk/assessments" className="btn ghost sm" style={{ marginTop: 10 }}>Open assessment queue →</Link>
        </Card>

        <Card title="Availability & health">
          <p className="cell-sub" style={{ marginTop: 0 }}>Read from Integrations&rsquo; Health Monitoring — this dashboard displays it, it does not run its own uptime checks.</p>
          <div className="stat-row" style={{ marginBottom: 10 }}>
            <Stat label="Unreachable" value={unreachable.length} tone={unreachable.length ? "red" : undefined} />
            <Stat label="Persistent issue (≥48h)" value={persistent.length} tone={persistent.length ? "red" : undefined} />
          </div>
          {unreachable.length > 0 && (
            <RankedList items={unreachable.map((p) => ({ name: p.name, note: "unreachable", tone: "red" as const, href: "/integrations/health-monitoring" }))} />
          )}
        </Card>

        <Card title="Sub-processor visibility">
          <div className="stat-row">
            <Stat label="Disclosures approved" value={subApproved} />
            <Stat label="Pending" value={subPending} tone={subPending ? "yellow" : undefined} />
            <Stat label="Flagged undisclosed" value={subFlagged} tone={subFlagged ? "red" : undefined} />
          </div>
          <Link href="/vendor-risk/sub-processor-disclosures" className="btn ghost sm" style={{ marginTop: 10 }}>Open disclosures →</Link>
        </Card>
      </div>

      {/* Cross-module risk signals */}
      <h2 className="section-label" style={{ fontSize: 13, marginTop: 20 }}>Cross-module risk signals</h2>
      <div className="grid-2">
        <Card title="Linked to open Escalations (Legal-routed)">
          {escalations.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No Legal-routed escalations open.</p> : (
            <div className="stack" style={{ gap: 6 }}>
              {escalations.map((e) => (
                <Link key={e.id} href="/escalations?status=open" className="ranked-row">
                  <span className="cell-primary">{e.referenceCode ?? e.type.replace("_", " ")}</span>
                  <span className="cell-sub">{e.reason}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card title="Touching open Requests">
          {reqTouching.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No processors are in open deletion/access instructions.</p> : (
            <div className="stack" style={{ gap: 6 }}>
              {reqTouching.map((x) => (
                <div key={x.p.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="cell-primary">{x.p.name}</span>
                  <span className="row" style={{ gap: 6 }}>{x.reqs.map((r) => <Link key={r} href="/requests" className="row-link mono">{r}</Link>)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Processor · Purpose · PII map">
        <p className="cell-sub" style={{ marginTop: 0 }}>Click a processor to highlight every purpose and PII category it touches.</p>
        <TprmMindMap processors={mindMap} />
      </Card>
    </Shell>
  );
}

/** A three-segment completion bar (complete / in progress / not started). */
function SplitBar({ a, b, c }: { a: number; b: number; c: number }) {
  const total = Math.max(1, a + b + c);
  return (
    <div className="splitbar">
      <span style={{ width: `${(a / total) * 100}%`, background: "var(--green)" }} />
      <span style={{ width: `${(b / total) * 100}%`, background: "var(--yellow)" }} />
      <span style={{ width: `${(c / total) * 100}%`, background: "var(--text-4)" }} />
    </div>
  );
}
