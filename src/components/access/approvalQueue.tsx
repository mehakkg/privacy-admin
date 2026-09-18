"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ShieldAlert, Clock } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { approveRoleAction, rejectRoleAction } from "@/app/actions/rbac";
import { approvePurposeAction, rejectPurposeAction } from "@/app/actions/dataMap";
import { capabilityById, MACRO_NAV_ORDER, summarise, type MacroNav } from "@/lib/rbac";
import { lawfulBasisLabel } from "@/lib/processingActivity";
import type { ActionResult } from "@/app/actions/requests";

export interface QueueItem {
  id: string;
  kind: "role" | "purpose";
  name: string;
  description: string;
  requester: string;
  submittedAt: string; // ISO
  // role
  capabilityIds?: string[];
  // purpose
  legalBasis?: string | null;
  linkedElement?: { name: string; activity: string } | null;
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

  const approve = (i: QueueItem) => i.kind === "role" ? approveRoleAction(i.id) : approvePurposeAction(i.id);
  const reject = (i: QueueItem, reason: string) => i.kind === "role" ? rejectRoleAction(i.id, reason) : rejectPurposeAction(i.id, reason);

  // Bulk approve only for identical role requests (same capability set).
  const selectedItems = items.filter((i) => selected.has(i.id));
  const allRoles = selectedItems.length > 1 && selectedItems.every((i) => i.kind === "role");
  const identical = allRoles && new Set(selectedItems.map((i) => [...(i.capabilityIds ?? [])].sort().join(","))).size === 1;

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
        <span className="cell-sub">{items.length} request{items.length === 1 ? "" : "s"} awaiting a decision — roles and proposed purposes share this queue.</span>
        {identical && canApprove && (
          <button className="btn primary sm" disabled={pending} onClick={() => run(async () => {
            let last: ActionResult = { ok: true };
            for (const i of selectedItems) { last = await approve(i); if (!last.ok) break; }
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
              <th>Request</th><th>Type</th><th>Requester</th><th>Detail</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const old = ageHours(i.submittedAt) > 48;
              return (
                <tr key={`${i.kind}-${i.id}`} className="clickable" onClick={() => setOpen(i)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} /></td>
                  <td className="cell-primary">{i.name}</td>
                  <td><Pill tone={i.kind === "role" ? "blue" : "purple"} dot={false}>{i.kind === "role" ? "Role" : "Purpose"}</Pill></td>
                  <td className="cell-sub">{i.requester}</td>
                  <td className="cell-sub">{i.kind === "role" ? `${i.capabilityIds?.length ?? 0} capabilities` : lawfulBasisLabel(i.legalBasis)}</td>
                  <td><Pill tone={old ? "yellow" : "gray"}><Clock size={11} style={{ verticalAlign: "-1px" }} /> {ageLabel(i.submittedAt)}</Pill></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6}><div className="empty"><p style={{ margin: 0 }}>The approval queue is clear — no role or purpose requests are waiting.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {open && open.kind === "role" && (
        <RoleApprovalDrawer
          item={open} canApprove={canApprove} pending={pending}
          onApprove={() => run(() => approve(open), () => setOpen(null))}
          onReject={(reason) => run(() => reject(open, reason), () => setOpen(null))}
          onClose={() => setOpen(null)}
        />
      )}
      {open && open.kind === "purpose" && (
        <PurposeApprovalDrawer
          item={open} canApprove={canApprove} pending={pending}
          onApprove={() => run(() => approve(open), () => setOpen(null))}
          onReject={(reason) => run(() => reject(open, reason), () => setOpen(null))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function RejectBlock({ pending, onReject, onCancel }: { pending: boolean; onReject: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="stack" style={{ gap: 6, marginTop: 12 }}>
      <textarea className="input" rows={2} placeholder="Reason for rejection (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <div className="row" style={{ gap: 6 }}>
        <button className="btn danger sm" disabled={pending || !reason.trim()} onClick={() => onReject(reason)}>Confirm rejection</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Role request — Approve disabled until the full capability list is scrolled. */
function RoleApprovalDrawer({
  item, canApprove, pending, onApprove, onReject, onClose,
}: {
  item: QueueItem; canApprove: boolean; pending: boolean;
  onApprove: () => void; onReject: (reason: string) => void; onClose: () => void;
}) {
  const [viewed, setViewed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const ids = item.capabilityIds ?? [];

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setViewed(true);
  };

  const byGroup = MACRO_NAV_ORDER.map((g) => ({ group: g as MacroNav, caps: ids.map(capabilityById).filter((c) => c && c.group === g) })).filter((x) => x.caps.length > 0);
  const high = ids.filter((id) => capabilityById(id)?.sensitivity === "high").length;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <span className="row" style={{ gap: 8 }}><strong>{item.name}</strong><Pill tone="blue" dot={false}>Role</Pill></span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>Requested by {item.requester}. {summarise(ids)}</p>
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
              <button className="btn primary" disabled={!canApprove || !viewed || pending} title={!viewed ? "Review the full capability list first" : undefined} onClick={onApprove}>{pending ? "Approving…" : "Approve"}</button>
              <button className="btn btn-outline-danger" disabled={!canApprove} onClick={() => setRejecting(true)}>Reject</button>
            </div>
          ) : <RejectBlock pending={pending} onReject={onReject} onCancel={() => setRejecting(false)} />}
        </div>
      </aside>
    </div>
  );
}

/** Proposed-purpose request — shows the linked element and legal basis for context. */
function PurposeApprovalDrawer({
  item, canApprove, pending, onApprove, onReject, onClose,
}: {
  item: QueueItem; canApprove: boolean; pending: boolean;
  onApprove: () => void; onReject: (reason: string) => void; onClose: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(520px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <span className="row" style={{ gap: 8 }}><strong>{item.name}</strong><Pill tone="purple" dot={false}>Proposed purpose</Pill></span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>Proposed by {item.requester}.</p>
          <h3 className="drawer-section first">Proposal</h3>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Purpose</dt><dd>{item.name}</dd></div>
            <div style={{ display: "contents" }}><dt>Description</dt><dd>{item.description}</dd></div>
            <div style={{ display: "contents" }}><dt>Legal basis</dt><dd><Chip>{lawfulBasisLabel(item.legalBasis)}</Chip></dd></div>
            <div style={{ display: "contents" }}><dt>Proposed for</dt><dd>{item.linkedElement ? `${item.linkedElement.name} · ${item.linkedElement.activity}` : "—"}</dd></div>
          </dl>
          <div className="notice info" style={{ marginTop: 12 }}>
            <div className="notice-title">On approval</div>
            <div>This purpose becomes selectable for every element and is assigned to the one it was proposed for. Legal basis is fixed as proposed and is not editable after approval.</div>
          </div>

          {!rejecting ? (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn primary" disabled={!canApprove || pending} onClick={onApprove}>{pending ? "Approving…" : "Approve purpose"}</button>
              <button className="btn btn-outline-danger" disabled={!canApprove} onClick={() => setRejecting(true)}>Reject</button>
            </div>
          ) : <RejectBlock pending={pending} onReject={onReject} onCancel={() => setRejecting(false)} />}
        </div>
      </aside>
    </div>
  );
}
