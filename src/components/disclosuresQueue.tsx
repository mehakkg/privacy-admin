"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ShieldAlert } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { approveDisclosureAction, rejectDisclosureAction, routeFlaggedToLegalAction, resolveFlaggedAction } from "@/app/actions/subProcessor";
import { DATA_CATEGORY_LABEL, type DataCategory } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";

export interface DisclosureRow {
  id: string;
  primaryVendor: string;
  subProcessorName: string;
  scope: string;
  piiTypes: string[];
  status: string;
  reason: string | null;
  disclosedAt: string | null;
  docCount: number;
  docs: { name: string; docType: string; expiresAt: string | null }[];
  detected: boolean;
  flagStatus: string | null;
  rejectedReason: string | null;
}

export const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "gray" },
  pending_disclosure: { label: "Pending disclosure", tone: "yellow" },
  held_pending_approval: { label: "Held pending approval", tone: "orange" },
  active: { label: "Active", tone: "green" },
  flagged: { label: "Undisclosed — flagged", tone: "red" },
};

function piiLabel(t: string) { return DATA_CATEGORY_LABEL[t as DataCategory] ?? t; }

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function DisclosuresQueue({ rows, role }: { rows: DisclosureRow[]; role: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Primary vendor</th><th>Sub-processor</th><th>Purpose / scope</th><th>Status</th><th>Disclosed</th><th>Docs</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.draft;
              return (
                <tr key={r.id} className={`clickable${r.status === "flagged" ? " flagged-row" : ""}`} onClick={() => setOpenId(r.id)}>
                  <td className="cell-primary">{r.primaryVendor}</td>
                  <td>{r.status === "flagged" ? <span className="row" style={{ gap: 6 }}><ShieldAlert size={14} style={{ color: "var(--red)" }} />{r.subProcessorName}</span> : r.subProcessorName}</td>
                  <td className="cell-sub">{r.scope || "—"}</td>
                  <td><Pill tone={meta.tone}>{meta.label}</Pill></td>
                  <td className="cell-sub">{r.disclosedAt ?? "—"}</td>
                  <td className="cell-sub">{r.docCount > 0 ? "✓" : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6}><div className="empty">
                <p style={{ margin: "0 0 12px" }}>No sub-processor disclosures yet.</p>
                <Link href="/vendor-risk/sub-processor-disclosures/new" className="btn primary sm">Request a new sub-processor engagement</Link>
              </div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <DisclosureDrawer d={open} role={role} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function DisclosureDrawer({ d, role, onClose }: { d: DisclosureRow; role: string; onClose: () => void }) {
  const { pending, result, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const meta = STATUS_META[d.status] ?? STATUS_META.draft;
  const canApprove = role === "legal" || role === "dpo";

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(540px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <div className="row" style={{ gap: 8 }}><strong>{d.subProcessorName}</strong><Pill tone={meta.tone}>{meta.label}</Pill></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <h3 className="drawer-section first">Disclosure</h3>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Primary vendor</dt><dd>{d.primaryVendor}</dd></div>
            <div style={{ display: "contents" }}><dt>Scope</dt><dd>{d.scope || "—"}</dd></div>
            {d.reason && <div style={{ display: "contents" }}><dt>Reason</dt><dd>{d.reason}</dd></div>}
            <div style={{ display: "contents" }}><dt>PII types</dt><dd style={{ textTransform: "capitalize" }}>{d.piiTypes.map(piiLabel).join(", ") || "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Disclosed</dt><dd>{d.disclosedAt ?? "—"}</dd></div>
          </dl>
          {d.rejectedReason && <p className="cell-sub" style={{ color: "var(--red)" }}>Rejected: {d.rejectedReason}</p>}

          <h3 className="drawer-section">Compliance documents</h3>
          {d.docs.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No documents attached.</p> : (
            <div className="stack" style={{ gap: 6 }}>
              {d.docs.map((doc, i) => (
                <div key={i} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{doc.name} <span className="cell-sub">· {doc.docType}</span></span>
                  <span className="cell-sub">{doc.expiresAt ? `expires ${doc.expiresAt}` : "—"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Screen 3.3 — approval action, for a held disclosure */}
          {d.status === "held_pending_approval" && (
            <>
              <h3 className="drawer-section">Approval</h3>
              {canApprove ? (
                !rejecting ? (
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn primary" disabled={pending} onClick={() => run(() => approveDisclosureAction(d.id), onClose)}>{pending ? "Approving…" : "Approve engagement"}</button>
                    <button className="btn btn-outline-danger" onClick={() => setRejecting(true)}>Reject</button>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    <input className="input" placeholder="Reason for rejection (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn danger sm" disabled={pending || !reason.trim()} onClick={() => run(() => rejectDisclosureAction(d.id, reason), onClose)}>Confirm reject</button>
                      <button className="btn ghost sm" onClick={() => setRejecting(false)}>Cancel</button>
                    </div>
                  </div>
                )
              ) : (
                <p className="cell-sub">This engagement is <strong>held</strong> — no data can flow until Legal or the DPO approves. Switch to the Legal or DPO role to act.</p>
              )}
            </>
          )}

          {/* Flagged (detected) items route to Legal / resolve */}
          {d.status === "flagged" && (
            <>
              <h3 className="drawer-section">Investigation</h3>
              <p className="cell-sub" style={{ marginTop: 0 }}>Flag status: {d.flagStatus ?? "under_investigation"}</p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm" disabled={pending || d.flagStatus === "routed_to_legal"} onClick={() => run(() => routeFlaggedToLegalAction(d.id), onClose)}>Route to Legal</button>
                <button className="btn ghost sm" disabled={pending} onClick={() => run(() => resolveFlaggedAction(d.id), onClose)}>Covered by existing DPA</button>
              </div>
            </>
          )}
          <ActionError result={result} />
        </div>
      </aside>
    </div>
  );
}
