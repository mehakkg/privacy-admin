"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Lock } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { overrideVendorRiskAction } from "@/app/actions/vendorRisk";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/requests";

export interface VendorMapping { purposeName: string; locked: boolean; piiTypes: string[]; activityName: string | null }
export interface VendorOverride { from: string; to: string; by: string; reason: string; at: string }
export interface VendorDetail {
  id: string;
  name: string;
  category: string;
  riskRating: string;
  riskBaseline: string;
  ownerName: string | null;
  onboardedAt: string | null;
  lastReviewed: string | null;
  purposesCount: number;
  piiCount: number;
  dpa: { name: string | null; scope: string | null; signedAt: string | null; expiresAt: string | null; status: string; daysToExpiry: number | null; docLink: string | null };
  mappings: VendorMapping[];
  overrideHistory: VendorOverride[];
}

const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "orange", critical: "red" };
const RISKS = ["low", "medium", "high", "critical"];

/** DPA status, with "expiring" derived from proximity — never a stored flag. */
export function dpaLabel(status: string, days: number | null): { text: string; tone: PillTone } {
  if (status === "not_on_file") return { text: "Not on file", tone: "gray" };
  if (days !== null && days < 0) return { text: "Expired", tone: "red" };
  if (status === "active" && days !== null && days < 30) return { text: `Expiring (${days}d)`, tone: "yellow" };
  if (status === "active") return { text: "Active", tone: "green" };
  return { text: status, tone: "gray" };
}

export function VendorRegister({ vendors, view }: { vendors: VendorDetail[]; view: "vendors" | "dpa" }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = vendors.find((v) => v.id === openId) ?? null;

  return (
    <div>
      <div className="table-wrap">
        {view === "vendors" ? (
          <table className="dtable">
            <thead>
              <tr><th>Vendor</th><th>Category</th><th>Risk</th><th>Purposes</th><th>PII types</th><th>DPA status</th><th>Last reviewed</th></tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);
                return (
                  <tr key={v.id} className="clickable" onClick={() => setOpenId(v.id)}>
                    <td><span className="row-link">{v.name}</span></td>
                    <td className="cell-sub">{v.category}</td>
                    <td><Pill tone={RISK_TONE[v.riskRating]}>{v.riskRating}</Pill></td>
                    <td className="cell-sub">{v.purposesCount}</td>
                    <td className="cell-sub">{v.piiCount}</td>
                    <td><Pill tone={dpa.tone}>{dpa.text}</Pill></td>
                    <td className="cell-sub">{v.lastReviewed ?? "—"}</td>
                  </tr>
                );
              })}
              {vendors.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty">
                    <p style={{ margin: "0 0 4px", fontWeight: 600 }}>No vendors registered yet</p>
                    <p className="cell-sub" style={{ margin: "0 0 12px" }}>Vendors are added through the assessment intake flow.</p>
                    <Link href="/vendor-risk/assessments" className="btn primary sm">Assign a vendor questionnaire</Link>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="dtable">
            <thead>
              <tr><th>Vendor</th><th>Agreement scope</th><th>Signed</th><th>Expiry</th><th>Days to expiry</th><th>Status</th></tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);
                const red = v.dpa.daysToExpiry !== null && v.dpa.daysToExpiry < 30;
                return (
                  <tr key={v.id} className="clickable" onClick={() => setOpenId(v.id)}>
                    <td><span className="row-link">{v.name}</span></td>
                    <td className="cell-sub">{v.dpa.scope ?? "—"}</td>
                    <td className="cell-sub">{v.dpa.signedAt ?? "—"}</td>
                    <td className="cell-sub">{v.dpa.expiresAt ?? "—"}</td>
                    <td style={{ color: red ? "var(--red)" : undefined, fontWeight: red ? 600 : undefined }}>
                      {v.dpa.daysToExpiry === null ? "—" : v.dpa.daysToExpiry < 0 ? `${-v.dpa.daysToExpiry}d over` : `${v.dpa.daysToExpiry}d`}
                    </td>
                    <td><Pill tone={dpa.tone}>{dpa.text}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && <VendorDrawer v={open} focusDpa={view === "dpa"} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function VendorDrawer({ v, focusDpa, onClose }: { v: VendorDetail; focusDpa: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editRisk, setEditRisk] = useState(false);
  const [newRating, setNewRating] = useState(v.riskRating);
  const [reason, setReason] = useState("");
  const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);

  const saveRisk = () =>
    start(async () => {
      const r = await overrideVendorRiskAction(v.id, newRating, reason);
      setResult(r);
      if (r.ok) { setEditRisk(false); setReason(""); router.refresh(); }
    });

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(520px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="row" style={{ gap: 8 }}>
            <strong>{v.name}</strong>
            <Pill tone={RISK_TONE[v.riskRating]}>{v.riskRating}</Pill>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          {/* Overview */}
          <div className="section-label" style={{ marginTop: 0 }}>Overview</div>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Category</dt><dd>{v.category}</dd></div>
            <div style={{ display: "contents" }}><dt>Relationship owner</dt><dd>{v.ownerName ?? "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Onboarded</dt><dd>{v.onboardedAt ?? "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Baseline (system)</dt><dd><Pill tone={RISK_TONE[v.riskBaseline]} dot={false}>{v.riskBaseline}</Pill></dd></div>
          </dl>

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {!editRisk ? (
              <button className="btn ghost sm" onClick={() => { setEditRisk(true); setNewRating(v.riskRating); }}>Override risk rating…</button>
            ) : (
              <div className="stack" style={{ gap: 6, width: "100%" }}>
                <div className="row" style={{ gap: 6 }}>
                  <select className="input sm" value={newRating} onChange={(e) => setNewRating(e.target.value)} style={{ width: 130 }}>
                    {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input className="input sm" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn primary sm" disabled={pending || newRating === v.riskRating || !reason.trim()} onClick={saveRisk}>{pending ? "Saving…" : "Save override"}</button>
                  <button className="btn ghost sm" onClick={() => { setEditRisk(false); setReason(""); }}>Cancel</button>
                </div>
                <span className="cell-sub">Every override is logged: who, from, to, and why.</span>
              </div>
            )}
          </div>
          {v.overrideHistory.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 8 }}>
              {v.overrideHistory.map((o, i) => (
                <div key={i} className="cell-sub">
                  {o.by} changed {o.from} → {o.to} · {o.reason} · {o.at.slice(0, 10)}
                </div>
              ))}
            </div>
          )}
          <ActionError result={result} />

          {/* Purpose & PII mapping */}
          <div className="section-label">Purpose &amp; PII mapping</div>
          {v.mappings.length === 0 ? (
            <p className="cell-sub" style={{ margin: 0 }}>No purposes mapped — this vendor is not cleared to touch personal data.</p>
          ) : (
            <div className="table-wrap">
              <table className="dtable">
                <thead><tr><th>Purpose</th><th>PII types</th><th>Activity</th></tr></thead>
                <tbody>
                  {v.mappings.map((m, i) => (
                    <tr key={i}>
                      <td>{m.locked ? <span className="lock-inline"><Lock size={12} /> {m.purposeName}</span> : m.purposeName}</td>
                      <td className="cell-sub" style={{ textTransform: "capitalize" }}>{m.piiTypes.join(", ") || "—"}</td>
                      <td className="cell-sub">{m.activityName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* DPA & contract */}
          <div className="section-label" style={{ outline: focusDpa ? "2px solid var(--accent)" : undefined, outlineOffset: 4, borderRadius: 4 }}>DPA &amp; contract</div>
          {v.dpa.status === "not_on_file" ? (
            <Pill tone="gray">No DPA on file</Pill>
          ) : (
            <dl className="kv">
              <div style={{ display: "contents" }}><dt>Agreement</dt><dd>{v.dpa.name ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Scope</dt><dd>{v.dpa.scope ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Signed</dt><dd>{v.dpa.signedAt ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Expiry</dt><dd><span className="row" style={{ gap: 6 }}>{v.dpa.expiresAt ?? "—"} <Pill tone={dpa.tone}>{dpa.text}</Pill></span></dd></div>
            </dl>
          )}

          {/* Cross-links */}
          <div className="section-label">Assessment history</div>
          <Link href="/vendor-risk/assessments" className="btn ghost sm">Open this vendor&rsquo;s assessment →</Link>

          <div className="section-label">Sub-processor disclosures</div>
          <Link href="/vendor-risk/sub-processors" className="btn ghost sm">View sub-processor disclosures →</Link>
        </div>
      </aside>
    </div>
  );
}
