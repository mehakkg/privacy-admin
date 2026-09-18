"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ShieldAlert, Clock } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { approveRoleAction, rejectRoleAction } from "@/app/actions/rbac";
import { capabilityById, MACRO_NAV_ORDER, summarise, type MacroNav } from "@/lib/rbac";
import type { ActionResult } from "@/app/actions/requests";

export interface QueueItem {
  id: string;
  name: string;
  description: string;
  requester: string;
  capabilityIds: string[];
  submittedAt: string; // ISO
}

function ageHours(iso: string) { return (Date.now() - new Date(iso).getTime()) / 3_600_000; }
function ageLabel(iso: string) {
  const h = ageHours(iso);
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h old`;
  return `${Math.floor(h / 24)}d old`;
}

export function ApprovalQueue({ items, actingRole }: { items: QueueItem[]; actingRole: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState<QueueItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canApprove = actingRole === "dpo" || actingRole === "ciso";

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  // Bulk approve is only offered when the selected requests share an identical
  // capability set (an already-understood, repeatable shape).
  const selectedItems = items.filter((i) => selected.has(i.id));
  const identical = selectedItems.length > 1 && new Set(selectedItems.map((i) => [...i.capabilityIds].sort().join(","))).size === 1;

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      {!canApprove && (
        <div className="notice info" style={{ marginBottom: 12 }}>
          <div className="notice-title">You are acting as {actingRole.toUpperCase()}</div>
          <div>Only the DPO or CISO can approve or reject. You can review requests here; switch role to decide.</div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{items.length} request{items.length === 1 ? "" : "s"} awaiting a decision.</span>
        {identical && canApprove && (
          <button className="btn primary sm" disabled={pending} onClick={() => run(async () => {
            let last: ActionResult = { ok: true };
            for (const i of selectedItems) { last = await approveRoleAction(i.id); if (!last.ok) break; }
            return last;
          }, () => setSelected(new Set()))}>
            Bulk-approve {selectedItems.length} identical requests
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Role requested</th><th>Requester</th><th>Capabilities</th><th>Justification</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const old = ageHours(i.submittedAt) > 48;
              return (
                <tr key={i.id} className="clickable" onClick={() => setOpen(i)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} /></td>
                  <td className="cell-primary">{i.name}</td>
                  <td className="cell-sub">{i.requester}</td>
                  <td className="cell-sub">{i.capabilityIds.length}</td>
                  <td className="cell-sub" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.description}</td>
                  <td><Pill tone={old ? "yellow" : "gray"}><Clock size={11} style={{ verticalAlign: "-1px" }} /> {ageLabel(i.submittedAt)}</Pill></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6}><div className="empty"><p style={{ margin: 0 }}>The approval queue is clear — no role requests are waiting.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {open && (
        <ApprovalDrawer
          item={open}
          canApprove={canApprove}
          pending={pending}
          onApprove={() => run(() => approveRoleAction(open.id), () => setOpen(null))}
          onReject={(reason) => run(() => rejectRoleAction(open.id, reason), () => setOpen(null))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Detail drawer with the disabled-until-reviewed guardrail: Approve stays
 *  disabled until the reviewer has scrolled the full capability list. */
function ApprovalDrawer({
  item, canApprove, pending, onApprove, onReject, onClose,
}: {
  item: QueueItem; canApprove: boolean; pending: boolean;
  onApprove: () => void; onReject: (reason: string) => void; onClose: () => void;
}) {
  const [viewed, setViewed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setViewed(true);
  };

  const byGroup = MACRO_NAV_ORDER.map((g) => ({
    group: g as MacroNav,
    caps: item.capabilityIds.map(capabilityById).filter((c) => c && c.group === g),
  })).filter((x) => x.caps.length > 0);
  const high = item.capabilityIds.filter((id) => capabilityById(id)?.sensitivity === "high").length;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <strong>{item.name}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>Requested by {item.requester}. {summarise(item.capabilityIds)}</p>
          {high > 0 && <p className="row" style={{ gap: 6, color: "var(--red)", fontSize: 12.5 }}><ShieldAlert size={13} /> {high} high-sensitivity capabilit{high === 1 ? "y" : "ies"}.</p>}

          <h3 className="drawer-section first">Full capability set — scroll to review</h3>
          <div ref={listRef} onScroll={onScroll} className="approval-caplist">
            {byGroup.map(({ group, caps }) => (
              <div key={group} style={{ marginBottom: 10 }}>
                <div className="section-label">{group}</div>
                {caps.map((c) => c && (
                  <div key={c.id} className="cap-row-static">
                    <div className="stack" style={{ gap: 1 }}>
                      <span className="row" style={{ gap: 6 }}><span className="cell-primary">{c.action}</span>{c.sensitivity === "high" && <Pill tone="red">High</Pill>}</span>
                      <span className="cell-sub">{c.module} · {c.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className={`review-gate${viewed ? " done" : ""}`}>
            {viewed ? <><Check size={14} /> Capability list reviewed</> : "Scroll the full list above to enable approval"}
          </div>

          {!rejecting ? (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn primary" disabled={!canApprove || !viewed || pending} title={!viewed ? "Review the full capability list first" : undefined} onClick={onApprove}>
                {pending ? "Approving…" : "Approve"}
              </button>
              <button className="btn btn-outline-danger" disabled={!canApprove} onClick={() => setRejecting(true)}>Reject</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              <textarea className="input" rows={2} placeholder="Reason for rejection (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <div className="row" style={{ gap: 6 }}>
                <button className="btn danger sm" disabled={pending || !reason.trim()} onClick={() => onReject(reason)}>Confirm rejection</button>
                <button className="btn ghost sm" onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
