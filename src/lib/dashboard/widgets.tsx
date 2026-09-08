import type { ReactNode } from "react";
import { Pill } from "@/components/ui";
import type { DashboardMetrics, Bucket, TrendPoint } from "@/lib/dashboard/metrics";

/**
 * The widget catalog and its tiering — the single source of truth for what can
 * appear on the dashboard, where, and whether it can be removed.
 *
 *   Tier 1 — safety-critical. Pinned on Operations, never in the library, never
 *            removable. Its permanence is the point: these six map directly to
 *            the audit's highest-severity findings, so a "declutter" click must
 *            not be able to hide them.
 *   Tier 2 — recommended. Default on the fixed tabs, removable there, and the
 *            set "Start from recommended" copies into My Dashboard.
 *   Tier 3 — everything else. Off by default, lives only in My Dashboard.
 *
 * Categories mirror the sidebar's own top-level groupings, so finding a widget
 * to add never means learning a second taxonomy. This module is pure (no db, no
 * client hooks): the server renders the fixed tabs from it, and the client
 * My Dashboard renders from the very same definitions.
 */

export type Tier = 1 | 2 | 3;
export type WidgetSize = "compact" | "full";

export const WIDGET_CATEGORIES = [
  "Requests",
  "Escalations",
  "Data Map",
  "Consent & Notices",
  "Risk & Compliance",
  "Integrations",
] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

export interface WidgetDef {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  tier: Tier;
  sizes: WidgetSize[];
  render: (m: DashboardMetrics, size: WidgetSize) => ReactNode;
}

// --- Small, dependency-free visual primitives ------------------------------

function Big({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div>
      <div className="stat-value" style={{ fontSize: 30, color: tone }}>{value}</div>
      <div className="cell-sub">{label}</div>
    </div>
  );
}

function TwoUp({ a, b }: { a: { value: ReactNode; label: string; tone?: string }; b: { value: ReactNode; label: string; tone?: string } }) {
  return (
    <div className="row" style={{ gap: 24, alignItems: "baseline" }}>
      <Big {...a} />
      <Big {...b} />
    </div>
  );
}

const TONE_VAR: Record<string, string> = {
  green: "var(--green)", yellow: "var(--yellow)", red: "var(--red)", blue: "var(--blue)", gray: "var(--text-3)",
};

function Bars({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {buckets.length === 0 && <span className="cell-sub">No data.</span>}
      {buckets.map((b) => (
        <div key={b.label} className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="cell-sub" style={{ width: 92, textTransform: "capitalize", flexShrink: 0 }}>{b.label.replace(/_/g, " ")}</span>
          <span className="wbar"><span className="wbar-fill" style={{ width: `${(b.value / max) * 100}%`, background: b.tone ? TONE_VAR[b.tone] : "var(--accent)" }} /></span>
          <span className="cell-primary" style={{ width: 24, textAlign: "right" }}>{b.value}</span>
        </div>
      ))}
    </div>
  );
}

function Spark({ points, tone = "var(--accent)" }: { points: TrendPoint[]; tone?: string }) {
  const w = 220, h = 48, max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p.value / max) * (h - 6) - 3).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <path d={path} fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="row" style={{ justifyContent: "space-between" }}>
        {points.map((p, i) => <span key={i} className="cell-sub" style={{ fontSize: 10 }}>{p.label}</span>)}
      </div>
    </div>
  );
}

function Donut({ segments, centerLabel }: { segments: { value: number; color: string }[]; centerLabel: ReactNode }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  let acc = 0;
  const stops = segments.map((s) => {
    const from = (acc / total) * 360;
    acc += s.value;
    const to = (acc / total) * 360;
    return `${s.color} ${from}deg ${to}deg`;
  }).join(", ");
  return (
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: `conic-gradient(${stops})` }} />
      <div style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.1 }}>
        {centerLabel}
      </div>
    </div>
  );
}

function Ring({ pct, tone = "var(--accent)" }: { pct: number; tone?: string }) {
  return (
    <Donut segments={[{ value: pct, color: tone }, { value: 100 - pct, color: "var(--bg-muted)" }]}
      centerLabel={<span className="stat-value" style={{ fontSize: 18 }}>{pct}%</span>} />
  );
}

// --- Catalog ----------------------------------------------------------------

export const WIDGETS: WidgetDef[] = [
  // ---- Tier 1 — pinned on Operations, never in the library ----
  { id: "t1_open_requests", name: "Open requests", description: "Requests not yet closed.", category: "Requests", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.openRequests} label="Open requests" /> },
  { id: "t1_past_deadline", name: "Past deadline", description: "Open requests past the fulfilment deadline.", category: "Requests", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.pastDeadline} label="Past deadline" tone={m.pastDeadline ? "var(--red)" : undefined} /> },
  { id: "t1_blocked_retention", name: "Blocked on retention", description: "Requests blocked on an unreviewed retention exception.", category: "Requests", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.blockedOnRetention} label="Blocked on retention" tone={m.blockedOnRetention ? "var(--yellow)" : undefined} /> },
  { id: "t1_with_failures", name: "With failures", description: "Executions in a failed state.", category: "Requests", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.withFailures} label="With failures" tone={m.withFailures ? "var(--red)" : undefined} /> },
  { id: "t1_open_escalations", name: "Open escalations", description: "Escalations awaiting a ruling.", category: "Escalations", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.openEscalations} label="Open escalations" tone={m.openEscalations ? "var(--yellow)" : undefined} /> },
  { id: "t1_processors_unreachable", name: "Processors unreachable", description: "Data processors that are unreachable.", category: "Integrations", tier: 1, sizes: ["compact"], render: (m) => <Big value={m.processorsUnreachable} label="Processors unreachable" tone={m.processorsUnreachable ? "var(--red)" : undefined} /> },

  // ---- Tier 2 — recommended defaults ----
  {
    id: "completion_donut", name: "Completion status", description: "Requests by completion state.", category: "Requests", tier: 2, sizes: ["compact", "full"],
    render: (m) => (
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <Donut segments={[{ value: m.completion.verified, color: "var(--green)" }, { value: m.completion.partial, color: "var(--yellow)" }, { value: m.completion.pending, color: "var(--text-4)" }]}
          centerLabel={<span className="stat-value" style={{ fontSize: 16 }}>{m.completion.verified + m.completion.partial + m.completion.pending}</span>} />
        <div className="stack" style={{ gap: 4 }}>
          <span className="cell-sub"><span className="dot" style={{ background: "var(--green)" }} /> Verified {m.completion.verified}</span>
          <span className="cell-sub"><span className="dot" style={{ background: "var(--yellow)" }} /> Partial {m.completion.partial}</span>
          <span className="cell-sub"><span className="dot" style={{ background: "var(--text-4)" }} /> Pending {m.completion.pending}</span>
        </div>
      </div>
    ),
  },
  {
    id: "ropa_drift", name: "RoPA drift & violations", description: "Where reality and the register disagree.", category: "Data Map", tier: 2, sizes: ["compact", "full"],
    render: (m) => (
      <div>
        <Big value={m.ropaDrift.total} label="fields drift from the register" tone={m.ropaDrift.total ? "var(--yellow)" : "var(--green)"} />
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Reclassified since last scan</span><span className="cell-primary">{m.ropaDrift.reclassified}</span></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Not in any RoPA record</span><span className="cell-primary">{m.ropaDrift.unregistered}</span></div>
        </div>
      </div>
    ),
  },
  {
    id: "principal_linkage", name: "Data Principal linkage", description: "Classified fields tied to an identified individual.", category: "Data Map", tier: 2, sizes: ["compact", "full"],
    render: (m) => (
      <div>
        <TwoUp a={{ value: m.principalLinkage.linked, label: "linked", tone: "var(--green)" }} b={{ value: m.principalLinkage.unlinked, label: "unlinked", tone: m.principalLinkage.unlinked ? "var(--yellow)" : undefined }} />
        <div className="linkbar" style={{ marginTop: 10 }}><div className="linkbar-fill" style={{ width: `${m.principalLinkage.pct}%` }} /></div>
        <div className="cell-sub" style={{ marginTop: 6 }}>{m.principalLinkage.principals} identified principals mapped</div>
      </div>
    ),
  },
  { id: "discovery_coverage", name: "Discovery coverage", description: "Share of classified fields reviewed.", category: "Data Map", tier: 2, sizes: ["compact", "full"], render: (m) => <div className="row" style={{ gap: 16, alignItems: "center" }}><Ring pct={m.discoveryCoveragePct} /><span className="cell-sub">of fields reviewed</span></div> },
  { id: "compliance_score", name: "Compliance score", description: "Composite posture score.", category: "Risk & Compliance", tier: 2, sizes: ["compact", "full"], render: (m) => <div className="row" style={{ gap: 16, alignItems: "center" }}><Ring pct={m.complianceScore} tone="var(--green)" /><span className="cell-sub">composite of coverage, linkage &amp; hygiene</span></div> },
  { id: "notices_pending", name: "Notices pending approval", description: "Notices awaiting a DPO decision.", category: "Consent & Notices", tier: 2, sizes: ["compact"], render: (m) => <Big value={m.noticesPendingApproval} label="notices awaiting DPO" tone={m.noticesPendingApproval ? "var(--yellow)" : undefined} /> },

  // ---- Tier 3 — full library ----
  // Requests
  { id: "request_volume_trend", name: "Request volume trend", description: "Requests received per month.", category: "Requests", tier: 3, sizes: ["compact", "full"], render: (m) => <Spark points={m.requestVolumeTrend} /> },
  { id: "deadline_proximity", name: "Deadline proximity", description: "Soonest fulfilment deadlines.", category: "Requests", tier: 3, sizes: ["full"], render: (m) => (
    <div className="stack" style={{ gap: 6 }}>
      {m.deadlineProximity.length === 0 && <span className="cell-sub">No open deadlines.</span>}
      {m.deadlineProximity.map((d) => (
        <div key={d.ref} className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono cell-primary">{d.ref}</span>
          <Pill tone={d.daysLeft < 0 ? "red" : d.daysLeft < 7 ? "yellow" : "gray"}>{d.daysLeft < 0 ? `${-d.daysLeft}d over` : `${d.daysLeft}d left`}</Pill>
        </div>
      ))}
    </div>
  ) },
  { id: "request_type_breakdown", name: "Request type breakdown", description: "Requests by type.", category: "Requests", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.requestTypeBreakdown} /> },
  { id: "source_channel_breakdown", name: "Source channel breakdown", description: "Requests by origin channel.", category: "Requests", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.sourceChannelBreakdown} /> },
  { id: "resolution_time_trend", name: "Resolution time", description: "Average days to resolve a closed request.", category: "Requests", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.avgResolutionDays ?? "—"} label="avg days to resolve" /> },
  { id: "sla_compliance_trend", name: "SLA compliance trend", description: "On-time share per month.", category: "Requests", tier: 3, sizes: ["compact", "full"], render: (m) => <Spark points={m.slaComplianceTrend} tone="var(--green)" /> },

  // Escalations
  { id: "esc_by_type", name: "Escalations by type", description: "Escalations grouped by type.", category: "Escalations", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.escalationByType} /> },
  { id: "esc_by_role", name: "Escalations by routed-to role", description: "Escalations grouped by target role.", category: "Escalations", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.escalationByRole} /> },
  { id: "esc_avg_ruling", name: "Average time-to-ruling", description: "Mean days from raised to ruled.", category: "Escalations", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.avgTimeToRulingDays ?? "—"} label="avg days to a ruling" /> },

  // Data Map
  { id: "ropa_coverage_pct", name: "RoPA coverage %", description: "Share of processing captured in the register.", category: "Data Map", tier: 3, sizes: ["compact", "full"], render: (m) => <div className="row" style={{ gap: 16, alignItems: "center" }}><Ring pct={m.ropaCoveragePct} /><span className="cell-sub">of processing in a RoPA record</span></div> },
  { id: "fiduciary_sdf", name: "Fiduciary SDF breakdown", description: "Fiduciaries by SDF status.", category: "Data Map", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.fiduciarySdf} /> },
  { id: "dup_rot_counts", name: "Duplicate / ROT counts", description: "Unresolved duplicates and ROT candidates.", category: "Data Map", tier: 3, sizes: ["compact"], render: (m) => <TwoUp a={{ value: m.duplicateCount, label: "duplicates" }} b={{ value: m.rotCount, label: "ROT candidates" }} /> },
  { id: "classification_backlog", name: "Classification backlog", description: "Fields awaiting review.", category: "Data Map", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.classificationBacklog} label="fields awaiting review" tone={m.classificationBacklog ? "var(--yellow)" : undefined} /> },

  // Consent & Notices
  { id: "notice_status", name: "Notice status breakdown", description: "Notices by lifecycle status.", category: "Consent & Notices", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.noticeStatus} /> },
  { id: "consent_volume_trend", name: "Consent volume trend", description: "Consent records captured per month.", category: "Consent & Notices", tier: 3, sizes: ["compact", "full"], render: (m) => <Spark points={m.consentVolumeTrend} /> },
  { id: "webhook_health", name: "Webhook health", description: "Active vs failing webhooks.", category: "Consent & Notices", tier: 3, sizes: ["compact"], render: (m) => <TwoUp a={{ value: m.webhookHealth.active, label: "active", tone: "var(--green)" }} b={{ value: m.webhookHealth.failing, label: "failing", tone: m.webhookHealth.failing ? "var(--red)" : undefined }} /> },
  { id: "undisclosed_scripts", name: "Undisclosed scripts", description: "Open undisclosed cookie findings.", category: "Consent & Notices", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.undisclosedScripts} label="undisclosed scripts" tone={m.undisclosedScripts ? "var(--red)" : undefined} /> },
  { id: "consent_expiry", name: "Consent expiry approaching", description: "Consents expiring within 60 days.", category: "Consent & Notices", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.consentExpiringSoon} label="expiring within 60 days" tone={m.consentExpiringSoon ? "var(--yellow)" : undefined} /> },
  { id: "language_coverage", name: "Language coverage %", description: "Eighth-Schedule languages covered by variants.", category: "Consent & Notices", tier: 3, sizes: ["compact", "full"], render: (m) => <div className="row" style={{ gap: 16, alignItems: "center" }}><Ring pct={m.languageCoveragePct} /><span className="cell-sub">of 12 tracked languages</span></div> },
  { id: "assisted_sync", name: "Assisted collection sync", description: "Branch-captured consents synced vs pending.", category: "Consent & Notices", tier: 3, sizes: ["compact"], render: (m) => <TwoUp a={{ value: m.assistedSync.synced, label: "synced", tone: "var(--green)" }} b={{ value: m.assistedSync.pending, label: "pending", tone: m.assistedSync.pending ? "var(--yellow)" : undefined }} /> },

  // Risk & Compliance
  { id: "journey_scores", name: "Score by digital journey", description: "Compliance score per user journey.", category: "Risk & Compliance", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.journeyScores.map((j) => ({ label: j.label, value: j.value, tone: j.value >= 85 ? "green" : "yellow" }))} /> },
  { id: "protection_exceptions", name: "Protection rule exceptions", description: "Approved narrowed-scope exceptions.", category: "Risk & Compliance", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.protectionExceptions} label="rule exceptions" /> },
  { id: "policy_violations", name: "Policy violations by severity", description: "Open hygiene violations by severity.", category: "Risk & Compliance", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.policyViolations} /> },
  { id: "over_broad_access", name: "Over-broad access flags", description: "Privacy-relevant access flags (proxy: stale locations).", category: "Risk & Compliance", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.overBroadAccess} label="over-broad access flags" tone={m.overBroadAccess ? "var(--yellow)" : undefined} /> },
  { id: "vendor_risk", name: "Vendor risk breakdown", description: "Processors by risk classification.", category: "Risk & Compliance", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.vendorRisk} /> },
  { id: "audit_log_volume", name: "Audit log volume", description: "Total audit entries recorded.", category: "Risk & Compliance", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.auditLogVolume} label="audit entries" /> },

  // Integrations
  { id: "systems_by_status", name: "Connected systems by status", description: "Systems grouped by connection status.", category: "Integrations", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.systemsByStatus} /> },
  { id: "processors_by_status", name: "Data processors by status", description: "Processors grouped by health.", category: "Integrations", tier: 3, sizes: ["compact", "full"], render: (m) => <Bars buckets={m.processorsByStatus} /> },
  { id: "degraded_count", name: "Degraded systems / processors", description: "Anything not fully healthy.", category: "Integrations", tier: 3, sizes: ["compact"], render: (m) => <Big value={m.degradedCount} label="degraded systems / processors" tone={m.degradedCount ? "var(--yellow)" : undefined} /> },
];

export const WIDGET_BY_ID: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
export const TIER1 = WIDGETS.filter((w) => w.tier === 1);
export const TIER2 = WIDGETS.filter((w) => w.tier === 2);
/** Everything a role can add/remove in My Dashboard: Tier 2 and Tier 3. */
export const LIBRARY = WIDGETS.filter((w) => w.tier !== 1);
/** The "Start from recommended" set. */
export const RECOMMENDED_IDS = TIER2.map((w) => w.id);
