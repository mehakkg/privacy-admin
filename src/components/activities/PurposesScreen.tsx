"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, ChevronDown, ChevronRight, MoreHorizontal, Lock } from "lucide-react";
import type { PurposesView, PurposeRow, PurposeStatus } from "@/lib/engines/purposes";
import { formatDate } from "@/lib/datamap/foundations";
import { submitPurposeAction, approvePurposeAction, decidePurposeAction } from "@/app/actions/purposes";
import { PurposeDrawer } from "./PurposeDrawer";

const BASE = "/data-map/purposes";

type Actor = "admin" | "dpo" | "none";
function actorOf(r: PurposeRow): Actor {
  if (r.status === "pending") return "dpo";
  if (r.status === "draft" || r.status === "rejected" || r.notInNotice) return "admin";
  return "none";
}
const CHIP_TONE: Record<PurposeStatus, string> = { approved: "success", pending: "info", draft: "neutral", rejected: "danger" };

/**
 * Purposes (Master spec Part D) — a summary strip + two tabs: My work (actions
 * grouped by who acts) and All purposes (the full list). A detail pane opens on
 * a row click. Every number is computed from the same store.
 */
export function PurposesScreen({ view, role, tab, initialPurpose }: { view: PurposesView; role: string; tab: string; initialPurpose?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const myActor: Actor = role === "dpo" ? "dpo" : role === "ciso" || role === "legal" ? "none" : "admin";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [basis, setBasis] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPurpose ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; id?: string } | null>(null);
  const showToast = (msg: string, id?: string) => { setToast({ msg, id }); setTimeout(() => setToast(null), 6000); };

  const active = tab === "all" || tab === "work" ? tab : (myActor === "none" ? "all" : "work");
  useEffect(() => { try { localStorage.setItem("purposes.tab", active); } catch { /* fine */ } }, [active]);
  const setTab = (t: string) => router.push(`${BASE}?tab=${t}`);

  const syncUrl = (id: string | null) => { try { const u = new URL(window.location.href); if (id) u.searchParams.set("purpose", id); else u.searchParams.delete("purpose"); window.history.replaceState(null, "", u.toString()); } catch { /* fine */ } };
  const openPane = (id: string) => { setSelectedId(id); syncUrl(id); };
  const closePane = () => { setSelectedId(null); syncUrl(null); };

  const myWorkCount = view.rows.filter((r) => actorOf(r) === myActor).length;
  const filtered = view.rows.filter((r) =>
    (!q || `${r.name} ${r.linkedActivities.map((a) => a.name).join(" ")}`.toLowerCase().includes(q.toLowerCase())) &&
    (!status || r.status === status) &&
    (!basis || r.legalBasisShort.toLowerCase().startsWith(basis)),
  );
  const selected = selectedId ? view.rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="pa-list">
      <div className="pa-head">
        <div className="stack" style={{ gap: 4 }}>
          <div className="cell-sub">Configure / Data Map / Purposes</div>
          <h1 className="inv-title">Purposes</h1>
          <p className="cell-sub" style={{ margin: 0, maxWidth: 680 }}>Why personal data is processed. A consent-based purpose must be in a published notice before data is collected for it.</p>
        </div>
        <button className="btn primary" onClick={() => setAddOpen(true)}>+ Add purpose</button>
      </div>
      {addOpen && <PurposeDrawer
        existing={view.rows.map((r) => ({ id: r.id, name: r.name }))}
        onClose={() => setAddOpen(false)}
        onUse={(id) => { setAddOpen(false); openPane(id); }}
        onSaved={(id, status, name) => { setAddOpen(false); router.refresh(); showToast(status === "pending" ? `Submitted: ${name}` : `Draft saved: ${name}`, id); }}
      />}
      {toast && <div className="toast" role="status" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "var(--text, #0f172a)", color: "#fff", padding: "10px 16px", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", display: "flex", gap: 12, alignItems: "center" }}>
        <span>{toast.msg}</span>
        {toast.id && <button className="link-btn" style={{ color: "#93c5fd" }} onClick={() => { const id = toast.id!; setToast(null); openPane(id); }}>Open →</button>}
      </div>}

      <SummaryStrip c={view.counts} onNotice={() => { setTab("work"); }} />

      <div className="row" style={{ alignItems: "flex-start", gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dm-tabs" style={{ marginTop: 14 }}>
            <button className={`dm-tab${active === "work" ? " on" : ""}`} onClick={() => setTab("work")}>My work {myWorkCount}</button>
            <button className={`dm-tab${active === "all" ? " on" : ""}`} onClick={() => setTab("all")}>All purposes {view.rows.length}</button>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <div className="inv-search" style={{ flex: "0 0 auto", maxWidth: 280 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search purpose or activity" aria-label="Search" /></div>
            <select className="input sm" style={{ flex: "0 0 auto", width: "auto", minWidth: 120 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Status</option><option value="approved">Approved</option><option value="pending">Pending DPO</option><option value="draft">Draft</option><option value="rejected">Rejected</option></select>
            <select className="input sm" style={{ flex: "0 0 auto", width: "auto", minWidth: 130 }} value={basis} onChange={(e) => setBasis(e.target.value)} aria-label="Legal basis"><option value="">Legal basis</option><option value="consent">Consent</option><option value="legitimate">Legitimate use</option></select>
            {(q || status || basis) && <button className="btn ghost sm" onClick={() => { setQ(""); setStatus(""); setBasis(""); }}>Clear all</button>}
          </div>

          {active === "work"
            ? <MyWork rows={filtered} myActor={myActor} onOpen={openPane} />
            : <AllPurposes rows={filtered} onOpen={openPane} selectedId={selectedId} />}
        </div>
        {selected && <PurposePane row={selected} role={role} onClose={closePane} onChanged={() => router.refresh()} />}
      </div>
    </div>
  );
}

function SummaryStrip({ c, onNotice }: { c: PurposesView["counts"]; onNotice: () => void }) {
  return (
    <div className="inv-card" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="cell-sub">Approved <strong className="tnum">{c.approved}</strong> · Pending DPO <strong className="tnum">{c.pending}</strong> · Draft <strong className="tnum">{c.draft}</strong> · Rejected <strong className="tnum">{c.rejected}</strong></div>
        {c.notInNotice > 0 && <button className="link-btn sev-warning" onClick={onNotice}>{c.notInNotice} approved consent {c.notInNotice === 1 ? "purpose isn’t" : "purposes aren’t"} in any notice →</button>}
      </div>
    </div>
  );
}

// --- My work ----------------------------------------------------------------
function MyWork({ rows, myActor, onOpen }: { rows: PurposeRow[]; myActor: Actor; onOpen: (id: string) => void }) {
  const you = rows.filter((r) => actorOf(r) === myActor);
  const otherDpo = rows.filter((r) => actorOf(r) === "dpo" && myActor !== "dpo");
  const otherAdmin = rows.filter((r) => actorOf(r) === "admin" && myActor !== "admin");
  const groups: { label: string; rows: PurposeRow[]; you: boolean }[] = [
    { label: "You", rows: you, you: true },
    ...(myActor === "admin" ? [{ label: "Waiting on Kavita Menon", rows: otherDpo, you: false }] : [{ label: "Waiting on Ritu Nair", rows: otherAdmin, you: false }]),
  ];
  return (
    <div className="stack" style={{ gap: 18, marginTop: 14 }}>
      {groups.map((g) => <WorkGroup key={g.label} label={g.label} rows={g.rows} you={g.you} myActor={myActor} onOpen={onOpen} />)}
    </div>
  );
}

function WorkGroup({ label, rows, you, myActor, onOpen }: { label: string; rows: PurposeRow[]; you: boolean; myActor: Actor; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  if (rows.length === 0 && you) return <div><div className="cell-sub" style={{ fontWeight: 600, marginBottom: 6 }}>{label} · 0</div><div className="inv-noresult">You’re clear. Nothing needs you right now.</div></div>;
  if (rows.length === 0) return null;
  return (
    <div>
      <button className="row" style={{ gap: 8, alignItems: "center", background: "none", border: 0, cursor: "pointer", padding: 0, fontWeight: 600 }} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{label} · {rows.length}
      </button>
      {open && <div className="stack" style={{ gap: 0, marginTop: 6 }}>{rows.map((r) => <WorkRow key={r.id} r={r} canAct={you} myActor={myActor} onOpen={onOpen} />)}</div>}
    </div>
  );
}

function WorkRow({ r, canAct, myActor, onOpen }: { r: PurposeRow; canAct: boolean; myActor: Actor; onOpen: (id: string) => void }) {
  const [, start] = useTransition();
  const [reminded, setReminded] = useState(false);
  const verb = purposeVerb(r, myActor);
  const btn = canAct
    ? <button className="btn sm primary" onClick={() => onOpen(r.id)}>{verb}</button>
    : reminded ? <button className="btn sm" disabled>Reminded just now</button>
    : <button className="btn sm ghost" onClick={() => start(() => setReminded(true))}>Remind</button>;
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
      <div className="stack" style={{ gap: 2, minWidth: 0 }} role="button" onClick={() => onOpen(r.id)}>
        <div className="av-name" style={{ cursor: "pointer" }}>{r.name}</div>
        <div className="cell-sub">{r.legalBasisShort} · Used by {r.usedByCount} {r.usedByCount === 1 ? "activity" : "activities"}</div>
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
        <span className={`rchip ${CHIP_TONE[r.status]}`}>{r.notInNotice ? "Approved · not in a notice" : r.statusLabel}</span>
        {btn}
      </div>
    </div>
  );
}

function purposeVerb(r: PurposeRow, myActor: Actor): string {
  if (r.status === "draft") return "Submit for approval";
  if (r.status === "rejected") return "Revise";
  if (r.notInNotice) return "Add to notice";
  if (r.status === "pending" && myActor === "dpo") return "Review";
  return "Open";
}

// --- All purposes -----------------------------------------------------------
const SORT: Record<PurposeStatus, number> = { pending: 1, draft: 2, rejected: 3, approved: 4 };
function AllPurposes({ rows, onOpen, selectedId }: { rows: PurposeRow[]; onOpen: (id: string) => void; selectedId: string | null }) {
  const sorted = useMemo(() => rows.slice().sort((a, b) => (SORT[a.status] - SORT[b.status]) || a.name.localeCompare(b.name)), [rows]);
  return (
    <table className="av-table" style={{ marginTop: 14 }}>
      <thead><tr><th>Purpose</th><th>Legal basis</th><th>Used by</th><th>Notice</th><th>Status</th><th>Ver</th><th></th></tr></thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} className={`av-row${r.id === selectedId ? " on" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; onOpen(r.id); }}>
            <td><span className="av-name">{r.name}</span><div className="cell-sub" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div></td>
            <td className="cell-sub">{r.legalBasisShort}</td>
            <td className="cell-sub">{r.usedByCount}{r.usedByFirst ? ` · ${r.usedByFirst}` : ""}</td>
            <td>{r.notInNotice ? <span className="sev-warning">Not in a notice</span> : r.inNotice ? <span className="cell-sub">{r.inNotice}</span> : r.status === "approved" ? <span className="cell-sub">Not required</span> : <span className="cell-sub">—</span>}</td>
            <td><span className={`rchip ${CHIP_TONE[r.status]}`}>{r.statusLabel}</span>{r.status === "pending" && <div className="cell-sub">Kavita Menon: approve</div>}</td>
            <td className="cell-sub">v{r.version}{r.status === "approved" ? " 🔒" : ""}</td>
            <td><button className="icon-btn" aria-label="Open" onClick={() => onOpen(r.id)}><MoreHorizontal size={16} /></button></td>
          </tr>
        ))}
        {sorted.length === 0 && <tr><td colSpan={7} className="cell-sub" style={{ padding: 16 }}>No purposes match. <button className="link-btn" onClick={() => location.assign(BASE)}>Clear filters</button></td></tr>}
      </tbody>
    </table>
  );
}

// --- Detail pane ------------------------------------------------------------
function PurposePane({ row, role, onClose, onChanged }: { row: PurposeRow; role: string; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [propose, setPropose] = useState(false);
  const isDpo = role === "dpo";
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); onChanged(); });

  return (
    <aside className="df-detail" style={{ flex: "0 0 420px", borderLeft: "1px solid var(--border)", paddingLeft: 16, marginLeft: 16, overflow: "auto" }}>
      <div className="mp-drawer-head" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}><strong>{row.name}</strong><span className={`rchip ${CHIP_TONE[row.status]}`}>{row.statusLabel}</span></div>
          <div className="cell-sub">v{row.version}{row.approvedBy ? ` · Approved by ${row.approvedBy}${row.approvedAt ? ` on ${formatDate(row.approvedAt)}` : ""}` : ""}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 10 }}>
        {row.status === "rejected" && row.rejectionReason && <div className="notice warn" style={{ margin: 0 }}><strong>Rejected by Kavita Menon.</strong> {row.rejectionReason}</div>}

        <Field label="Description" hint="This is the text Data Principals see in the notice.">{row.description || "—"}</Field>
        <Field label="Legal basis">{row.legalBasisLabel}</Field>

        <div className="stack" style={{ gap: 4 }}>
          <span className="cell-sub" style={{ fontWeight: 600 }}>Used by {row.usedByCount} {row.usedByCount === 1 ? "activity" : "activities"}</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {row.linkedActivities.map((a) => <Link key={a.id} href={`/data-map/processing-activities?activity=${a.id}`} className="chip" style={{ fontSize: 11.5 }}>{a.name}</Link>)}
            {row.linkedActivities.length === 0 && <span className="cell-sub">Not used yet</span>}
          </div>
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <span className="cell-sub" style={{ fontWeight: 600 }}>In notices</span>
          {row.notInNotice
            ? <div className="notice warn" style={{ margin: 0 }}>Data can’t be collected for this purpose until it’s in a published notice (Section 5(1)). <Link href="/consent/notices" className="link-btn">Add to notice →</Link></div>
            : row.inNotice ? <span className="cell-sub">{row.inNotice}</span>
            : row.noticeRequired ? <span className="cell-sub">—</span>
            : <span className="cell-sub">Not required (legitimate use)</span>}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        {row.status === "draft" && <button className="btn primary" onClick={() => run(() => submitPurposeAction(row.id))}>Submit for approval</button>}
        {row.status === "rejected" && <button className="btn primary" onClick={() => run(() => submitPurposeAction(row.id))}>Resubmit</button>}
        {row.status === "pending" && isDpo && <>
          <button className="btn" onClick={() => setReject(true)}>Reject</button>
          <button className="btn primary" onClick={() => run(() => approvePurposeAction(row.id))}>Approve</button>
        </>}
        {row.status === "pending" && !isDpo && <button className="btn" disabled>Waiting on Kavita Menon</button>}
        {row.status === "approved" && row.notInNotice && <Link href="/consent/notices" className="btn primary">Add to notice →</Link>}
        {row.status === "approved" && !row.notInNotice && <button className="btn" onClick={() => setPropose(true)}><Lock size={13} /> Propose change</button>}
      </div>

      {reject && (
        <Modal title="Reject purpose" onClose={() => setReject(false)}>
          <p className="cell-sub" style={{ marginTop: 0 }}>Say what needs to change so it can be approved.</p>
          <textarea className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Say what needs to change so it can be approved." />
          <div className="std-modal-foot"><button className="btn" onClick={() => setReject(false)}>Cancel</button><button className="btn primary" disabled={reason.trim().length < 20} onClick={() => { setReject(false); run(() => decidePurposeAction(row.id, "reject", reason)); }}>Reject</button></div>
        </Modal>
      )}
      {propose && (
        <Modal title="Propose a change" onClose={() => setPropose(false)}>
          <p className="cell-sub" style={{ marginTop: 0 }}>This creates v{row.version + 1} as a draft. v{row.version} stays live. When approved, {row.usedByCount} {row.usedByCount === 1 ? "activity" : "activities"} in the register will be marked Review due.</p>
          <div className="std-modal-foot"><button className="btn" onClick={() => setPropose(false)}>Cancel</button><button className="btn primary" onClick={() => { setPropose(false); router.push(`/data-map/purposes?edit=${row.id}`); }}>Create draft</button></div>
        </Modal>
      )}
    </aside>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="cell-sub" style={{ fontWeight: 600 }}>{label}</span>
      <div style={{ fontSize: 13 }}>{children}</div>
      {hint && <span className="cell-sub">{hint}</span>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 10 }}>{children}</div>
      </div>
    </div>
  );
}
