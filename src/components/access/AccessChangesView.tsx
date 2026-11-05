"use client";

import { useMemo, useState } from "react";
import { Check, Clock, AlertTriangle, ExternalLink, X, ShieldAlert, FileCheck } from "lucide-react";
import { ProductChip } from "@/components/shell/ProductChip";
import { iamLink } from "@/lib/products/deeplink";
import {
  type AccessChange, type AppRow, type RowState, type Rollup,
  TRIGGER_LABEL, ROLLUP_LABEL, rollupOf, verifiedCount,
} from "@/lib/products/accessChanges";

const ROLLUP_TONE: Record<Rollup, string> = { pending: "ok", partial: "sev-warning", verified: "sev-success" };

const STATE_META: Record<RowState, { label: string; tone: string; icon: typeof Check }> = {
  verified: { label: "Verified", tone: "sev-success", icon: Check },
  pending: { label: "Waiting on IAM", tone: "ok", icon: Clock },
  no_confirmation: { label: "No confirmation from IAM", tone: "sev-danger", icon: AlertTriangle },
  failed: { label: "Failed", tone: "sev-danger", icon: AlertTriangle },
  manual: { label: "Manually verified", tone: "sev-accent", icon: FileCheck },
};

export function AccessChangesView({ initial }: { initial: AccessChange[] }) {
  const [changes, setChanges] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const open = useMemo(() => changes.find((c) => c.id === openId) ?? null, [changes, openId]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  // Mutate one row of one change (the verified loop is client-side in the demo).
  const patchRow = (changeId: string, app: string, patch: Partial<AppRow>) =>
    setChanges((cs) => cs.map((c) => c.id !== changeId ? c : { ...c, rows: c.rows.map((r) => r.app === app ? { ...r, ...patch } : r) }));

  const retry = (c: AccessChange, r: AppRow) => { patchRow(c.id, r.app, { state: "pending", error: undefined }); flash(`Revocation re-sent to miniOrange IAM for ${r.app}.`); };
  const escalate = (c: AccessChange, r: AppRow) => flash(`Escalated to the CISO: ${r.app} on ${c.subject}.`);
  const confirmManual = (c: AccessChange, r: AppRow) => { patchRow(c.id, r.app, { state: "manual", evidence: "Confirmed manually with evidence", at: "just now" }); flash(`${r.app} marked manually verified.`); };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Entry points into IAM (§5.2) */}
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <a href={iamLink("Access review campaigns", { label: "Access changes", href: "/access/changes" })} className="row-link">Access reviews <ExternalLink size={13} /></a>
        <a href={iamLink("Dormant accounts", { label: "Access changes", href: "/access/changes" })} className="row-link">Dormant accounts <ExternalLink size={13} /></a>
        <span className="cell-sub" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Executed in <ProductChip product="iam" /> · verified by receipt
        </span>
      </div>

      {/* Queue */}
      <div className="ac-list">
        {changes.map((c) => {
          const roll = rollupOf(c.rows);
          const vc = verifiedCount(c.rows);
          return (
            <button key={c.id} className="ac-card" onClick={() => setOpenId(c.id)}>
              <div className="ac-card-main">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12.5 }}>{c.id}</span>
                  <strong>{c.subject}</strong>
                  <span className="cell-sub">· {TRIGGER_LABEL[c.trigger]} · {c.createdAgo}</span>
                </div>
                <div className="cell-sub" style={{ marginTop: 2 }}>{c.reason}</div>
              </div>
              <div className="ac-card-side">
                <span className={`inv-status ${ROLLUP_TONE[roll]}`}>{ROLLUP_LABEL[roll]}</span>
                <span className="cell-sub"><span className="tnum">{vc}</span> of <span className="tnum">{c.rows.length}</span> verified</span>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="mp-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <aside className="mp-drawer" role="dialog" aria-label={open.id}>
            <div className="mp-drawer-head">
              <div className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12.5 }}>{open.id}</span>
                  <strong>{open.subject}</strong>
                  <a href={iamLink(`Person · ${open.subject}`, { label: open.id, href: "/access/changes" })} className="row-link" style={{ fontSize: 12 }}>View in IAM <ExternalLink size={11} /></a>
                </div>
                <span className="cell-sub">{TRIGGER_LABEL[open.trigger]} · {open.createdAgo}</span>
              </div>
              <button className="icon-btn" onClick={() => setOpenId(null)}><X size={15} /></button>
            </div>
            <div className="mp-drawer-body stack" style={{ gap: 16 }}>
              <p className="cell-sub" style={{ margin: 0 }}>{open.reason}</p>

              {(() => { const roll = rollupOf(open.rows); const vc = verifiedCount(open.rows); return (
                <div className="ac-rollup">
                  <span className={`inv-status ${ROLLUP_TONE[roll]}`}>{ROLLUP_LABEL[roll]}</span>
                  <span className="cell-sub"><span className="tnum">{vc}</span> of <span className="tnum">{open.rows.length}</span> applications verified from IAM receipts</span>
                </div>
              ); })()}

              <section className="stack" style={{ gap: 0 }}>
                <div className="inv-sec-h" style={{ display: "flex", alignItems: "center", gap: 6 }}>Target applications <ProductChip product="iam" /></div>
                {open.rows.map((r) => {
                  const m = STATE_META[r.state]; const Icon = m.icon;
                  return (
                    <div key={r.app} className="ac-row">
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <strong style={{ fontSize: 13 }}>{r.app}</strong>
                          {!r.iamManaged && <span className="cell-sub" style={{ fontSize: 11 }}>· not managed by IAM</span>}
                        </div>
                        <span className="cell-sub">{r.entitlement}</span>
                        {r.state === "verified" && <span className="cell-sub">Source: IAM receipt {r.receiptId} · {r.at}</span>}
                        {r.state === "manual" && <span className="cell-sub">{r.evidence} · {r.at}</span>}
                        {r.state === "failed" && r.error && <span className="cell-sub sev-danger">{r.error}</span>}
                        {r.state === "no_confirmation" && <span className="cell-sub">No receipt within the 24h policy window.</span>}
                      </div>
                      <div className="ac-row-side">
                        <span className={`inv-status ${m.tone}`}><Icon size={13} /> {m.label}</span>
                        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
                          {(r.state === "no_confirmation" || r.state === "failed") && <button className="link-btn" onClick={() => retry(open, r)}>Retry</button>}
                          {r.state === "no_confirmation" && <button className="link-btn" onClick={() => escalate(open, r)}>Escalate</button>}
                          {!r.iamManaged && r.state !== "manual" && <button className="link-btn" onClick={() => confirmManual(open, r)}>Confirm manually</button>}
                          <a href={iamLink(`${r.app} · ${open.subject}`, { label: open.id, href: "/access/changes" })} className="row-link" style={{ fontSize: 12 }}>Open in IAM <ExternalLink size={11} /></a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </aside>
        </div>
      )}

      {toast && <div className="ac-toast" role="status"><ShieldAlert size={14} /> {toast}</div>}
    </div>
  );
}
