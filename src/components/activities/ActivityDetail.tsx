"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowLeft, Lock, AlertTriangle, ExternalLink, X } from "lucide-react";
import type { ActivityDetailView } from "@/lib/engines/activities";
import { formatDate } from "@/lib/datamap/foundations";

const BASE = "/data-map/processing-activities";
const TABS: { key: string; label: string }[] = [
  { key: "fields", label: "Data fields" },
  { key: "purposes", label: "Purposes" },
  { key: "systems", label: "Systems & processors" },
  { key: "consent", label: "Consent" },
  { key: "history", label: "History" },
];

const APPROVAL_CHIP: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "success" },
  pending: { label: "Pending DPO approval", cls: "info" },
  draft: { label: "Draft", cls: "amber-outline" },
  rejected: { label: "Rejected", cls: "amber-fill" },
};

export function ActivityDetail({ view, tab }: { view: ActivityDetailView; tab?: string }) {
  const router = useRouter();
  const [propose, setPropose] = useState(false);
  const active = TABS.some((t) => t.key === tab) ? tab! : "fields";
  const setTab = (k: string) => router.push(`${BASE}/${view.id}?tab=${k}`);
  const routeEdit = (pane?: string) => router.push(`${BASE}/${view.id}/edit${pane ? `?pane=${pane}` : ""}`);

  const primary = view.waiting ? <span className="btn" style={{ opacity: 0.55, cursor: "not-allowed" }} title="Waiting for Kavita Menon">Waiting for DPO</span>
    : view.next ? <button className="btn primary" onClick={() => routeEdit(view.reviewDue ? "review" : undefined)}>{view.next.text}</button>
    : view.locked ? <button className="btn primary" onClick={() => setPropose(true)}>Propose change</button>
    : <button className="btn primary" onClick={() => routeEdit()}>Edit</button>;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Link href={`${BASE}?bucket=all`} className="row-link"><ArrowLeft size={14} /> Activities</Link>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <h1 className="inv-title">{view.name}</h1>
            <span className={`rchip ${view.chipTone}`}>{view.chipLabel}</span>
          </div>
          <div className="cell-sub">
            {view.entityName ?? "—"} · Owner {view.owner ?? "No owner"}{view.department ? ` · ${view.department}` : ""}
            {view.version != null ? ` · v${view.version}` : ""}
            {view.approvedBy && view.approvedAt ? ` · Approved by ${view.approvedBy} on ${formatDate(view.approvedAt)}` : ""}
          </div>
        </div>
        <div className="row" style={{ gap: 8, whiteSpace: "nowrap" }}>{primary}</div>
      </div>

      {/* State banners */}
      {view.reviewDue && (
        <div className="notice warn" style={{ margin: 0 }}>
          <strong>Review due.</strong>{" "}
          {view.reviewDrift.length ? view.reviewDrift.join(" ") : "This activity hasn’t been reviewed in over 90 days."}
        </div>
      )}
      {view.waiting && <div className="notice info" style={{ margin: 0 }}>Waiting for Kavita Menon. Edits are disabled until she rules.</div>}
      {view.locked && !view.reviewDue && <div className="notice info" style={{ margin: 0 }}>Version {view.version} is in the register. Propose a change to edit it.</div>}

      {/* Tabs */}
      <div className="dm-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`dm-tab${active === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {active === "fields" && <FieldsTab view={view} onEdit={() => routeEdit("purpose")} />}
      {active === "purposes" && <PurposesTab view={view} onEdit={() => routeEdit("purpose")} />}
      {active === "systems" && <SystemsTab view={view} />}
      {active === "consent" && <ConsentTab view={view} />}
      {active === "history" && <HistoryTab view={view} />}

      {propose && <ProposeModal view={view} onClose={() => setPropose(false)} onConfirm={() => { setPropose(false); routeEdit(); }} />}
    </div>
  );
}

function FieldsTab({ view, onEdit }: { view: ActivityDetailView; onEdit: () => void }) {
  if (view.fields.length === 0) return <Empty text="No data fields yet." action={!view.locked ? { label: "Add data", onClick: onEdit } : undefined} />;
  return (
    <table className="av-table">
      <thead><tr><th>Field</th><th>Data category</th><th>Sensitivity</th><th>Purpose</th><th>Retention</th><th>Collected</th><th>Source</th></tr></thead>
      <tbody>
        {view.fields.map((f, i) => (
          <tr key={i}>
            <td className="av-name">{f.name}</td>
            <td className="cell-sub">{f.dataCategory ?? "—"}</td>
            <td>{f.sensitivity === "Not classified" ? <span className="cell-sub">Not classified · <a href="#" className="row-link">Classify in DLP <ExternalLink size={11} /></a></span> : <span className="chip">{f.sensitivity}</span>}</td>
            <td>{f.purposes.length ? f.purposes.map((p, j) => <span key={j} className="chip" style={{ marginRight: 4 }}>{p}</span>) : <span className="sev-warning">No purpose</span>}</td>
            <td className="cell-sub">{f.retention ?? <span className="sev-warning">Not set</span>}</td>
            <td className="cell-sub">{f.collectedAs}</td>
            <td className="cell-sub">{f.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PurposesTab({ view, onEdit }: { view: ActivityDetailView; onEdit: () => void }) {
  if (view.purposes.length === 0) return <Empty text="No purposes linked yet." action={!view.locked ? { label: "Add a purpose", onClick: onEdit } : undefined} />;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {view.purposes.map((p) => {
        const chip = APPROVAL_CHIP[p.approval];
        return (
          <div key={p.id} className="row" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
            <div className="stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}><strong>{p.name}</strong>{p.locked && <Lock size={13} />}</div>
              <div className="cell-sub">{p.legalBasisLabel} · {p.noticeRef ?? (p.legalBasisLabel.startsWith("Consent") ? <span className="sev-warning">Not in any notice</span> : "Notice not required")}</div>
            </div>
            <span className={`rchip ${chip.cls}`}>{chip.label}</span>
          </div>
        );
      })}
      {!view.locked && <div><Link href={`${BASE}/${view.id}/edit?pane=purpose`} className="link-btn">Add existing purpose</Link> · <Link href="/data-map/purposes" className="link-btn">Propose new purpose</Link></div>}
    </div>
  );
}

function SystemsTab({ view }: { view: ActivityDetailView }) {
  if (view.systems.length === 0) return <Empty text="No systems or processors linked yet." />;
  const byPurpose = new Map<string, typeof view.systems>();
  for (const s of view.systems) (byPurpose.get(s.purpose) ?? byPurpose.set(s.purpose, []).get(s.purpose)!).push(s);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {[...byPurpose.entries()].map(([purpose, rows]) => (
        <div key={purpose} className="stack" style={{ gap: 6 }}>
          <div className="cell-sub" style={{ fontWeight: 600 }}>{purpose}</div>
          <table className="av-table">
            <thead><tr><th>System</th><th>Type</th><th>Location</th><th>Contract</th></tr></thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={i}>
                  <td className="av-name">{s.name}</td>
                  <td className="cell-sub">{s.kindLabel}</td>
                  <td className="cell-sub">{s.country}{s.crossBorder ? " · outside India" : ""}</td>
                  <td>{s.contract ? <span className={s.contractTone === "warn" ? "sev-warning" : ""}>{s.contract}{s.contractTone === "warn" ? " — a processor needs a valid contract (Section 8(2))" : ""}</span> : <span className="cell-sub">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ConsentTab({ view }: { view: ActivityDetailView }) {
  return (
    <div className="stack" style={{ gap: 12, maxWidth: 620 }}>
      <div><span className="cell-sub">Collected through:</span> {view.consent.channels.join(", ")}</div>
      <div><span className="cell-sub">Notice:</span> {view.consent.noticeRefs.length ? view.consent.noticeRefs.join(", ") : "Not required for a legitimate-use activity"}</div>
      <div><Link href="/consent/platform" className="link-btn">Open in Consent collection <ExternalLink size={12} /></Link></div>
      <p className="cell-sub" style={{ margin: 0 }}>This is a read-only summary. Consent collection (SDK, consent page, age verification) is configured in Consent &amp; Notices.</p>
    </div>
  );
}

function HistoryTab({ view }: { view: ActivityDetailView }) {
  if (view.versions.length === 0) return <Empty text="No versions yet. This activity enters the register when it is activated." />;
  return (
    <div className="stack" style={{ gap: 0 }}>
      {view.versions.map((v) => (
        <div key={v.number} className="row" style={{ gap: 12, padding: "12px 0", borderTop: "1px solid var(--border-soft)" }}>
          <strong style={{ minWidth: 80 }}>Version {v.number}</strong>
          <div className="stack" style={{ gap: 2 }}>
            <div>{v.state === "active" ? "In the register" : "Superseded"} · activated by {v.activatedBy} on {formatDate(v.activatedAt)}</div>
            <div className="cell-sub">Hash {v.hash}{v.reason ? ` · ${v.reason}` : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return <div className="inv-noresult">{text}{action && <> <button className="link-btn" onClick={action.onClick}>{action.label}</button></>}</div>;
}

function ProposeModal({ view, onClose, onConfirm }: { view: ActivityDetailView; onClose: () => void; onConfirm: () => void }) {
  const next = (view.version ?? 1) + 1;
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label="Propose a change">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Propose a change</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body"><p className="cell-sub" style={{ margin: 0 }}>This creates v{next} as a draft. v{view.version} stays in the register until Kavita Menon approves.</p></div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={onConfirm}>Create draft</button></div>
      </div>
    </div>, document.body);
}
