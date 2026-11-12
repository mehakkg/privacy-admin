"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutGrid, Sparkles, ShieldCheck, Database, CheckSquare, Users, ClipboardList,
  HelpCircle, Settings, Search, Bell, Plus, ArrowRight, ArrowUpRight, Clock,
  ChevronDown, MoreHorizontal, UserCog, FileText, ScrollText, FileCheck,
} from "lucide-react";

/* ============================================================ fixtures
   The Overview is a curated demo surface; these mirror the approved comp. */

type Mode = "frequent" | "first";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutGrid, href: "/home" },
  { key: "journey", label: "Privacy journey", icon: Sparkles, href: "/setup" },
  { key: "compliance", label: "Compliance hub", icon: ShieldCheck, href: "/audit" },
  { key: "inventory", label: "Data inventory", icon: Database, href: "/data-map/inventory" },
  { key: "consent", label: "Consent manager", icon: CheckSquare, href: "/consent/notices" },
  { key: "rights", label: "Data principal rights", icon: Users, href: "/requests", badge: 6 },
  { key: "assessments", label: "Assessments", icon: ClipboardList, href: "/reports" },
];

const INBOX = [
  { icon: Users, tone: "rose", title: "Execute erasure across systems", sub: "REQ-1042 · Rahul Kapoor · Customer 88421", source: "Grievance Officer", lane: "Rights request", sla: "18h 24m", slaTone: "danger", status: "Scope confirmed", statusTone: "accent" },
  { icon: FileCheck, tone: "amber", title: "Publish approved privacy notice", sub: "POL-208 · Mobile banking · English + 3 languages", source: "DPO approval", lane: "Approved policy", sla: "1d 6h", slaTone: "warn", status: "Ready to implement", statusTone: "warn" },
  { icon: ShieldCheck, tone: "blue", title: "Revoke offboarded user access", sub: "IAM-761 · Neha Shah · 6 connected systems", source: "miniOrange IAM", lane: "Access change", sla: "2d 3h", slaTone: "muted", status: "Awaiting execution", statusTone: "accent" },
  { icon: ScrollText, tone: "green", title: "Compile deletion evidence", sub: "EVD-093 · Case GR-1019 · PDF evidence package", source: "Grievance Officer", lane: "Evidence request", sla: "3d 8h", slaTone: "muted", status: "3 of 4 events found", statusTone: "ok" },
];

const ALERTS = [
  { tone: "urgent", text: "7 requests past the fulfilment deadline", cta: "Open requests", href: "/requests" },
  { tone: "urgent", text: "1 processor unreachable — a deadline may be at risk", cta: "Health monitoring", href: "/integrations/health-monitoring" },
  { tone: "attention", text: "6 escalations awaiting a ruling", cta: "Open escalations", href: "/escalations" },
  { tone: "attention", text: "1 request blocked on a retention exception", cta: "Open request", href: "/requests" },
];

const ACTIVITY = [
  { title: "Erasure run verified", sub: "REQ-1038 · Admin", ago: "12 min" },
  { title: "DPO ruling received", sub: "REQ-1042 · Retention", ago: "34 min" },
  { title: "IAM access revoked", sub: "Neha Shah · 6 systems", ago: "1 hr" },
  { title: "RoPA suggestion accepted", sub: "Customer analytics", ago: "3 hr" },
];

/* ============================================================ shell */

export function OverviewApp() {
  const [mode, setMode] = useState<Mode>("frequent");
  const [tab, setTab] = useState<"ops" | "health" | "audit">("ops");
  const first = mode === "first";

  return (
    <div className="ov">
      {/* Sidebar */}
      <aside className="ov-side">
        <div className="ov-logo">
          <span className="ov-logo-mark">mO</span>
          <span className="ov-logo-txt"><strong>miniOrange</strong><span>DATA PRIVACY</span></span>
        </div>

        <button className="ov-ws">
          <span className="ov-ws-ic">A</span>
          <span className="ov-ws-txt">
            <strong>{first ? "Meridian Financial Ser…" : "Acme India Pvt. Ltd."}</strong>
            <span>{first ? "Setting up" : "Primary workspace"}</span>
          </span>
          <ChevronDown size={16} className="ov-ws-chev" />
        </button>

        <nav className="ov-nav">
          <p className="ov-nav-label">Workspace</p>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.key === "overview";
            return (
              <Link key={n.key} href={n.href} className={`ov-nav-item${active ? " active" : ""}`}>
                <Icon size={18} strokeWidth={1.9} />
                <span>{n.label}</span>
                {n.badge ? <span className="ov-nav-badge">{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ov-side-foot">
          <a href="#" className="ov-nav-item"><HelpCircle size={18} strokeWidth={1.9} /><span>Help &amp; resources</span></a>
          <Link href="/settings/organization" className="ov-nav-item"><Settings size={18} strokeWidth={1.9} /><span>Settings</span></Link>
          <div className="ov-user">
            <span className="ov-user-ic">AS</span>
            <span className="ov-user-txt"><strong>Ananya Sharma</strong><span>Administrator</span></span>
            <MoreHorizontal size={16} className="ov-ws-chev" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="ov-main">
        <header className="ov-top">
          <label className="ov-search">
            <Search size={16} />
            <input placeholder="Search policies, requests, data…" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="ov-top-right">
            <button className="ov-viewas"><span className="cell-sub">Viewing as</span> <strong>Admin</strong> <ChevronDown size={15} /></button>
            <button className="ov-icon-btn ov-bell" aria-label="Notifications"><Bell size={19} strokeWidth={1.8} /><span className="ov-bell-dot" /></button>
            <span className="ov-divline" />
            <a href="#" className="ov-support"><HelpCircle size={17} strokeWidth={1.8} /> Support</a>
          </div>
        </header>

        <div className="ov-page">
          {/* Heading row */}
          <div className="ov-head">
            <div>
              <p className="ov-kicker">DPDP Command Center</p>
              <h1 className="ov-h1">{first ? "Welcome, Ananya" : "Good morning, Ananya"}</h1>
              <p className="ov-lead">{first ? "Let’s prepare your privacy workspace for a confident first go-live." : "Manage privacy operations, access, integrations, and organization-wide compliance."}</p>
            </div>
            <button className="ov-btn-primary"><Plus size={17} /> Create action</button>
          </div>

          {/* Demo-state toggle */}
          <div className="ov-demo">
            <span><span className="ov-demo-label">Demo state</span> <strong>{first ? "First-time administrator" : "Frequent administrator"}</strong></span>
            <div className="ov-seg">
              <button className={first ? "on" : ""} onClick={() => setMode("first")}>First-time admin</button>
              <button className={!first ? "on" : ""} onClick={() => setMode("frequent")}>Frequent admin</button>
            </div>
          </div>

          {first ? <FirstTime /> : <Frequent tab={tab} setTab={setTab} />}

          <footer className="ov-foot">
            <span>Data Privacy by miniOrange</span>
            <span>Last synced 8 minutes ago · All systems operational</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ frequent admin */

function Frequent({ tab, setTab }: { tab: "ops" | "health" | "audit"; setTab: (t: "ops" | "health" | "audit") => void }) {
  return (
    <>
      {/* Setup strip */}
      <div className="ov-setup">
        <span className="ov-setup-badge">4/8</span>
        <div className="ov-setup-txt">
          <strong>Complete your privacy workspace setup</strong>
          <span className="cell-sub">4 of 8 required tasks done · Waiting on 3 teammates · Go-live: 0 of 3 services</span>
        </div>
        <div className="ov-setup-bar" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => <span key={i} className={i < 4 ? "on" : ""} />)}
        </div>
        <Link href="/setup" className="ov-btn-primary sm">Continue setup <ArrowRight size={15} /></Link>
      </div>

      {/* Entity bar */}
      <div className="ov-entity">
        <ShieldCheck size={17} className="ov-entity-ic" />
        <span><span className="cell-sub">Acting within</span> <strong>Acme India Pvt. Ltd.</strong></span>
        <span className="ov-entity-sep">All records, systems, processors, and policies are scoped to this obligated entity.</span>
        <button className="ov-entity-switch">Switch entity <ChevronDown size={14} /></button>
      </div>

      {/* Tabs */}
      <div className="ov-tabs">
        {([["ops", "Operations", 12], ["health", "Data health", 3], ["audit", "Compliance & audit", 4]] as const).map(([k, l, c]) => (
          <button key={k} className={`ov-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l} <span className="ov-tab-count">{c}</span></button>
        ))}
      </div>

      {tab === "ops" && <OpsTab />}
      {tab === "health" && <HealthTab />}
      {tab === "audit" && <AuditTab />}
    </>
  );
}

function OpsTab() {
  const stats = [
    { label: "Needs your action", value: 12, dot: "danger", note: "3 at risk" },
    { label: "Waiting on others", value: 5, dot: "amber", note: "2 DPO rulings" },
    { label: "Verified today", value: 8, dot: "green", note: "Across 24 systems" },
    { label: "At risk tomorrow", value: 2, dot: "danger", note: "Reassign before leave" },
  ];
  return (
    <>
      <div className="ov-stats">
        {stats.map((s) => (
          <div key={s.label} className="ov-stat">
            <span className="ov-stat-label">{s.label}</span>
            <span className="ov-stat-value">{s.value}</span>
            <span className="ov-stat-note"><i className={`ov-dot ${s.dot}`} /> {s.note}</span>
          </div>
        ))}
      </div>

      {/* Action inbox */}
      <section className="ov-card">
        <div className="ov-card-head">
          <div>
            <p className="ov-card-kicker">Admin action inbox</p>
            <h2 className="ov-card-title">Needs your action</h2>
            <p className="cell-sub" style={{ margin: 0 }}>Work from every role, ordered by statutory deadline.</p>
          </div>
          <div className="ov-card-tools">
            <span className="ov-pill-input"><Search size={14} /> Search</span>
            <span className="ov-pill-input">Deadline proximity <ChevronDown size={14} /></span>
          </div>
        </div>

        <div className="ov-table">
          <div className="ov-tr ov-th">
            <span>Work item</span><span>Source</span><span>Lane</span><span>SLA remaining</span><span>Status</span><span />
          </div>
          {INBOX.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="ov-tr">
                <span className="ov-work">
                  <span className={`ov-work-ic ${r.tone}`}><Icon size={17} /></span>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}><strong>{r.title}</strong><span className="cell-sub">{r.sub}</span></span>
                </span>
                <span className="cell-sub">{r.source}</span>
                <span><span className="ov-lane">{r.lane}</span></span>
                <span className={`ov-sla ${r.slaTone}`}><Clock size={14} /> {r.sla}</span>
                <span className="ov-status"><i className={`ov-dot ${r.statusTone}`} /> {r.status}</span>
                <span className="ov-chev"><ArrowRight size={15} /></span>
              </div>
            );
          })}
        </div>
        <div className="ov-card-foot">
          <span className="cell-sub">Showing 4 of 12 actions</span>
          <Link href="/my-work" className="ov-link">View all actions <ArrowRight size={14} /></Link>
        </div>
      </section>

      {/* Alerts + activity */}
      <div className="ov-grid2">
        <section className="ov-card pad">
          <div className="ov-mini-head"><h3>Critical alerts</h3><Link href="/audit" className="ov-link">View all</Link></div>
          <div className="stack" style={{ gap: 2 }}>
            {ALERTS.map((a) => (
              <div key={a.text} className="ov-alert">
                <span className={`ov-tag ${a.tone === "urgent" ? "danger" : "amber"}`}><i className="ov-dot sm" />{a.tone === "urgent" ? "Urgent" : "Attention"}</span>
                <span className="ov-alert-txt">{a.text}</span>
                <Link href={a.href} className="ov-link sm">{a.cta} <ArrowRight size={13} /></Link>
              </div>
            ))}
          </div>
        </section>

        <section className="ov-card pad">
          <div className="ov-mini-head"><h3>Recent activity</h3><Link href="/audit" className="ov-link">Audit log</Link></div>
          <div className="stack" style={{ gap: 0 }}>
            {ACTIVITY.map((e) => (
              <div key={e.title} className="ov-act">
                <i className="ov-dot green" />
                <span className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}><strong>{e.title}</strong><span className="cell-sub">{e.sub}</span></span>
                <span className="cell-sub">{e.ago}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function MetricCard({ title, badge, badgeTone, children, foot, footHref }: { title: string; badge?: string; badgeTone?: string; children: React.ReactNode; foot?: string; footHref?: string }) {
  return (
    <section className="ov-card pad ov-metric">
      <div className="ov-metric-head"><h3>{title}</h3>{badge && <span className={`ov-chip ${badgeTone ?? ""}`}>{badge}</span>}</div>
      <div className="ov-metric-body">{children}</div>
      {foot && <Link href={footHref ?? "#"} className="ov-metric-foot">{foot} <ArrowRight size={14} /></Link>}
    </section>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; max: number; tone: string }[] }) {
  return (
    <div className="stack" style={{ gap: 9, width: "100%" }}>
      {rows.map((r) => (
        <div key={r.label} className="ov-bar-row">
          <span className="cell-sub ov-bar-label">{r.label}</span>
          <span className="ov-bar"><span className={`ov-bar-fill ${r.tone}`} style={{ width: `${(r.value / r.max) * 100}%` }} /></span>
          <span className="ov-bar-val tnum">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function HealthTab() {
  return (
    <div className="ov-metric-grid">
      <MetricCard title="DLP classification coverage" badge="Connected" badgeTone="ok" foot="Review unclassified fields" footHref="/data-map/inventory">
        <div className="ov-big"><span className="ov-big-num">75%</span><span className="cell-sub">3,842 of 5,123 fields reviewed</span></div>
      </MetricCard>
      <MetricCard title="RoPA coverage" badge="Healthy" badgeTone="ok" foot="Open RoPA register" footHref="/discovery/ropa">
        <div className="ov-big"><span className="ov-big-num">100%</span><span className="cell-sub">42 processing activities recorded</span></div>
      </MetricCard>
      <MetricCard title="Data Principal linkage" badge="Connected" badgeTone="ok" foot="Resolve unmatched records" footHref="/requests/identity-matching">
        <div className="ov-big"><span className="ov-big-num">92%</span><span className="cell-sub">148 linked · 12 unlinked</span></div>
      </MetricCard>
      <MetricCard title="RoPA drift & violations" badge="Monitoring" badgeTone="muted">
        <div className="ov-big"><span className="ov-big-num green">0</span><span className="cell-sub">Fields drifted from the approved register</span></div>
        <div className="ov-kv"><span className="cell-sub">Reclassified since DLP sync</span><span className="tnum">0</span></div>
        <div className="ov-kv"><span className="cell-sub">Not in any RoPA record</span><span className="tnum">0</span></div>
      </MetricCard>
      <MetricCard title="Inventory gaps" badge="Review" badgeTone="amber" foot="Review gaps" footHref="/data-map/inventory">
        <div className="ov-big"><span className="ov-big-num amber">2</span><span className="cell-sub">Sources need classification or an owner</span></div>
      </MetricCard>
      <MetricCard title="Connected systems" badge="6 total" badgeTone="muted">
        <Bars rows={[
          { label: "Healthy", value: 3, max: 6, tone: "green" },
          { label: "Down", value: 1, max: 6, tone: "danger" },
          { label: "Manual only", value: 1, max: 6, tone: "amber" },
          { label: "Degraded", value: 1, max: 6, tone: "amber" },
        ]} />
      </MetricCard>
      <section className="ov-card pad ov-metric ov-span-all">
        <div className="ov-metric-head"><h3>Data processors by status</h3><span className="ov-chip muted">19 connected</span></div>
        <div className="ov-metric-body">
          <Bars rows={[
            { label: "Responsive", value: 18, max: 19, tone: "green" },
            { label: "Unreachable", value: 1, max: 19, tone: "danger" },
          ]} />
        </div>
        <Link href="/integrations/health-monitoring" className="ov-metric-foot">Open processor monitoring <ArrowRight size={14} /></Link>
      </section>
    </div>
  );
}

function AuditTab() {
  return (
    <div className="ov-metric-grid">
      <MetricCard title="Composite compliance score" badge="Needs attention" badgeTone="amber" foot="View score breakdown" footHref="/reports">
        <div className="ov-score"><span className="ov-big-num">63%</span><span className="stack" style={{ gap: 2 }}><strong className="ov-trend">+4%</strong><span className="cell-sub">Coverage, linkage &amp; hygiene</span></span></div>
      </MetricCard>
      <MetricCard title="Policy violations" badge="1 open" badgeTone="amber" foot="Review violation" footHref="/audit/violations">
        <Bars rows={[
          { label: "High", value: 0, max: 1, tone: "danger" },
          { label: "Medium", value: 1, max: 1, tone: "amber" },
          { label: "Low", value: 0, max: 1, tone: "green" },
        ]} />
      </MetricCard>
      <MetricCard title="Vendor risk breakdown" badge="19 vendors" badgeTone="muted" foot="Open TPRM risk register" footHref="/tprm-console">
        <Bars rows={[
          { label: "High", value: 2, max: 19, tone: "danger" },
          { label: "Medium", value: 11, max: 19, tone: "amber" },
          { label: "Unrated", value: 4, max: 19, tone: "muted" },
          { label: "Low", value: 2, max: 19, tone: "green" },
        ]} />
      </MetricCard>
      <MetricCard title="Protection rule exceptions" foot="Review details" footHref="/data-protection/rules">
        <div className="ov-big"><span className="ov-big-num amber">3</span><span className="cell-sub">Review security control scope</span></div>
      </MetricCard>
      <MetricCard title="Over-broad access flags" foot="Review details" footHref="/access/changes">
        <div className="ov-big"><span className="ov-big-num amber">1</span><span className="cell-sub">Review in miniOrange IAM</span></div>
      </MetricCard>
      <MetricCard title="Immutable audit events" foot="Review details" footHref="/audit">
        <div className="ov-big"><span className="ov-big-num green">180</span><span className="cell-sub">Search and export evidence</span></div>
      </MetricCard>
    </div>
  );
}

/* ============================================================ first-time admin */

function FirstTime() {
  return (
    <>
      <section className="ov-welcome">
        <div className="ov-welcome-body">
          <span className="ov-welcome-ic"><Sparkles size={22} /></span>
          <p className="ov-kicker" style={{ marginTop: 18 }}>Welcome to miniOrange Data Privacy</p>
          <h2 className="ov-welcome-title">Build a trusted privacy foundation</h2>
          <p className="ov-welcome-sub">Start with the essentials. We’ll unlock operations and compliance insights as your systems, governance, and team become ready.</p>
          <Link href="/setup" className="ov-btn-primary" style={{ marginTop: 18 }}>Continue setup <ArrowRight size={16} /></Link>
        </div>
        <div className="ov-welcome-ring">
          <div className="ov-ring"><span className="ov-ring-num">50<small>%</small></span></div>
          <strong>4 of 8 required tasks complete</strong>
          <span className="cell-sub">Estimated time remaining: 18 min</span>
        </div>
      </section>

      <div className="ov-next">
        <span className="ov-next-tag">Next</span>
        <div className="ov-next-txt">
          <span className="cell-sub">Your next recommended step</span>
          <strong>Confirm Significant Data Fiduciary status</strong>
          <span className="cell-sub">Required for the correct governance and reporting controls under Section 10.</span>
        </div>
        <span className="ov-next-time">~2 min</span>
        <Link href="/setup" className="ov-btn-ghost">Confirm status <ArrowRight size={15} /></Link>
      </div>

      <div className="ov-stats three">
        <div className="ov-stat"><span className="ov-stat-label">Open rights requests</span><span className="ov-stat-value">—</span><span className="ov-stat-note"><Clock size={13} /> Available once request intake is live</span></div>
        <div className="ov-stat"><span className="ov-stat-label">Pending DPO approvals</span><span className="ov-stat-value">0</span><span className="ov-stat-note"><i className="ov-dot green" /> Live now · No approvals pending</span></div>
        <div className="ov-stat"><span className="ov-stat-label">Connected systems</span><span className="ov-stat-value">2</span><span className="ov-stat-note ov-warn"><i className="ov-dot amber" /> 1 more system recommended</span></div>
      </div>

      <div style={{ marginTop: 26 }}>
        <p className="ov-kicker">Foundation checklist</p>
        <div className="ov-mini-head" style={{ marginBottom: 14 }}><h3 style={{ fontSize: 18 }}>Three things to get right before go-live</h3><Link href="/setup" className="ov-link">View all 8 tasks</Link></div>
        <div className="ov-metric-grid three">
          {[
            { icon: Database, title: "Connect your data", done: 3, total: 4, desc: "IAM and DLP are connected. Verify one remaining business system." },
            { icon: ShieldCheck, title: "Set governance", done: 0, total: 2, desc: "Confirm the accountable contacts and your SDF status." },
            { icon: CheckSquare, title: "Prepare experiences", done: 0, total: 3, desc: "Configure the rights portal, notices, and consent collection." },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <section key={c.title} className="ov-card pad ov-check">
                <div className="ov-check-head"><span className="ov-check-ic"><Icon size={18} /></span><span className="cell-sub tnum">{c.done} of {c.total}</span></div>
                <strong className="ov-check-title">{c.title}</strong>
                <p className="cell-sub ov-check-desc">{c.desc}</p>
                <span className="ov-check-bar"><span style={{ width: `${(c.done / c.total) * 100}%` }} /></span>
                <Link href="/setup" className="ov-check-foot">Continue <ArrowRight size={14} /></Link>
              </section>
            );
          })}
        </div>
      </div>

      <div className="ov-grid2" style={{ marginTop: 22 }}>
        <section className="ov-card pad">
          <div className="ov-mini-head"><h3>Waiting on your team</h3><Link href="/settings/organization" className="ov-link">Manage team</Link></div>
          <div className="stack" style={{ gap: 0 }}>
            {[["DR", "Devika Rao", "Confirm DPO profile"], ["GM", "Gaurav Menon", "Accept grievance role"], ["AR", "Arvind Rao", "Review protection scope"]].map(([ini, name, task]) => (
              <div key={name} className="ov-team">
                <span className="ov-user-ic sm">{ini}</span>
                <span className="stack" style={{ gap: 1, flex: 1 }}><strong>{name}</strong><span className="cell-sub">{task}</span></span>
                <button className="ov-link sm">Remind</button>
              </div>
            ))}
          </div>
        </section>
        <section className="ov-card pad ov-unlock">
          <p className="ov-kicker light"><LayoutGrid size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />What unlocks next</p>
          <h3 className="ov-unlock-title">Your operations command center</h3>
          <p className="ov-unlock-sub">Once setup is complete, this space becomes a deadline-first inbox for requests, access changes, policy implementation, and evidence.</p>
          <div className="ov-unlock-bar"><span /><span /><span /></div>
        </section>
      </div>
    </>
  );
}
