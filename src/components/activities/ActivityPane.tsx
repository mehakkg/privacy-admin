"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check as CheckIcon, Clock, Lock } from "lucide-react";
import type { PaneView } from "@/lib/engines/activities";
import type { CheckKey } from "@/lib/activities/readiness";
import {
  getActivityPaneAction, setBasicsAction, submitActivityForDpoAction,
} from "@/app/actions/activities";
import { addExistingPurposeAction, submitPurposeAction } from "@/app/actions/purposes";
import { getDataPickerAction, addDataAction } from "@/app/actions/activityData";
import { getVendorOptionsAction, addProcessorAction } from "@/app/actions/activityProcessors";

const BASE = "/data-map/processing-activities";
const EXPLAIN: Partial<Record<CheckKey, string>> = {
  notice: "Consent-based purposes need a published notice before data is collected (Section 5(1)).",
  systems: "A processor needs a valid contract (Section 8(2)).",
};

/** The 480px slide-in detail pane. Opens on a row click without a route change,
 *  deep-links via ?activity=, closes on Esc. Failed checks the current user owns
 *  get an inline fix right here. */
export function ActivityPane({ id, role, onClose, onChanged }: { id: string; role: string; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<PaneView | null>(null);
  const [, start] = useTransition();
  const sessionId = useRef<string>(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).current;
  const [propose, setPropose] = useState(false);

  const load = () => getActivityPaneAction(id).then(setV);
  useEffect(() => { setV(null); load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const after = () => { load(); onChanged(); };
  const myActor = role === "dpo" ? "dpo" : role === "ciso" || role === "legal" ? "none" : "admin";

  if (!v) return <aside className="df-detail" style={{ flex: "0 0 480px" }}><div className="mp-drawer-head"><strong>Loading…</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div></aside>;

  const ownsBlock = v.actor === myActor;

  return (
    <aside className="df-detail" style={{ flex: "0 0 480px", borderLeft: "1px solid var(--border)", paddingLeft: 16, marginLeft: 16, overflow: "auto" }}>
      <div className="mp-drawer-head" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}><strong>{v.name}</strong><span className={`rchip ${v.chipTone}`}>{v.chipLabel}</span></div>
          <div className="cell-sub">{v.owner ?? "No owner"}{v.department ? ` · ${v.department}` : ""} · {v.entityName ?? "—"}</div>
          <div className="cell-sub">{v.versionLabel}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="stack" style={{ gap: 10, marginTop: 10 }} aria-label={v.aria}>
        {v.checks.map((c) => {
          const fixable = c.state === "block" && ownsBlock && !v.locked;
          return (
            <div key={c.key} className="stack" style={{ gap: 4, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {c.state === "pass" ? <CheckIcon size={15} style={{ color: "var(--green, #16a34a)" }} />
                  : c.state === "na" ? <span className="cell-sub" style={{ width: 15, textAlign: "center" }}>–</span>
                  : c.state === "block" && !ownsBlock ? <Clock size={15} style={{ color: "var(--blue, #2563eb)" }} />
                  : c.state === "block" ? <span style={{ color: "var(--yellow-700, #b45309)", fontWeight: 700, width: 15, textAlign: "center" }}>!</span>
                  : <span className="cell-sub" style={{ width: 15, textAlign: "center" }}>·</span>}
                <strong style={{ fontSize: 13 }}>{c.label}</strong>
                {c.state === "pass" && <span className="cell-sub">{v.summaries[c.key]}</span>}
                {c.state === "na" && <span className="cell-sub">{v.summaries[c.key]}</span>}
                {c.state === "block" && !ownsBlock && <span className="cell-sub">Waiting on {v.actor === "dpo" ? "Kavita Menon" : "the business owner"}</span>}
              </div>
              {c.state === "block" && EXPLAIN[c.key] && <div className="cell-sub" style={{ paddingLeft: 23 }}>{EXPLAIN[c.key]}</div>}
              {fixable && <div style={{ paddingLeft: 23 }}><Fix v={v} ck={c.key} sessionId={sessionId} after={after} router={router} /></div>}
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Link href={`${BASE}/${v.id}`} className="link-btn">Open full activity →</Link>
        {v.locked ? <button className="btn primary" onClick={() => setPropose(true)}><Lock size={13} /> Propose change</button>
          : v.canSubmit ? <button className="btn primary" onClick={() => start(async () => { await submitActivityForDpoAction(v.id, ""); after(); })}>Submit for DPO review</button>
          : <button className="btn primary" disabled title={v.actor === "dpo" ? "Waiting on Kavita Menon" : undefined}>Submit for DPO review</button>}
      </div>

      {propose && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPropose(false); }}>
          <div className="modal std-modal sm" role="dialog" aria-modal="true">
            <div className="std-modal-head"><h3 style={{ margin: 0 }}>Propose a change</h3><button className="icon-btn" onClick={() => setPropose(false)}><X size={16} /></button></div>
            <div className="std-modal-body"><p className="cell-sub" style={{ margin: 0 }}>This creates v{v.nextVersion} as a draft. v{v.nextVersion - 1} stays in the register until Kavita Menon approves.</p></div>
            <div className="std-modal-foot"><button className="btn" onClick={() => setPropose(false)}>Cancel</button><button className="btn primary" onClick={() => { setPropose(false); router.push(`${BASE}/${v.id}/edit?pane=basics`); }}>Create draft</button></div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Fix({ v, ck, sessionId, after, router }: { v: PaneView; ck: CheckKey; sessionId: string; after: () => void; router: ReturnType<typeof useRouter> }) {
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => { setBusy(true); start(async () => { await fn(); setBusy(false); after(); }); };

  if (ck === "basics") {
    return (
      <div className="stack" style={{ gap: 8 }}>
        {!v.owner && (
          <select className="input sm" defaultValue="" disabled={busy} onChange={(e) => e.target.value && run(() => setBasicsAction(v.id, { ownerName: e.target.value }, v.baseRev, sessionId))}>
            <option value="">Choose an owner…</option>{v.ownerOptions.map((o) => <option key={o.name} value={o.name}>{o.name} — {o.department}</option>)}
          </select>
        )}
        {v.currentPrincipals.length === 0 && (
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>{v.principalOptions.map((p) => <button key={p.id} className="btn ghost sm" disabled={busy} onClick={() => run(() => setBasicsAction(v.id, { principals: [p.id as never] }, v.baseRev, sessionId))}>+ {p.label}</button>)}</div>
        )}
        {v.purposeOptions.length > 0 && v.owner && v.currentPrincipals.length > 0 && (
          <select className="input sm" defaultValue="" disabled={busy} onChange={(e) => e.target.value && run(() => addExistingPurposeAction(v.id, e.target.value))}>
            <option value="">Add a purpose…</option>{v.purposeOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
    );
  }
  if (ck === "data" && v.blockingPurposeId) return <FieldPicker activityId={v.id} purposeId={v.blockingPurposeId} busy={busy} run={run} />;
  if (ck === "systems" && v.blockingPurposeId) return <SystemPicker activityId={v.id} purposeId={v.blockingPurposeId} busy={busy} run={run} />;
  if (ck === "purpose" && v.blockingPurposeId) return (
    <div className="stack" style={{ gap: 6 }}>
      {v.rejectedReason && <div className="notice warn" style={{ margin: 0 }}><strong>Rejected by Kavita Menon.</strong> {v.rejectedReason}</div>}
      <div><button className="btn primary sm" disabled={busy} onClick={() => run(() => submitPurposeAction(v.blockingPurposeId!))}>{v.rejectedReason ? "Resubmit purpose" : "Submit purpose"}</button></div>
    </div>
  );
  if (ck === "notice" && v.noticeTarget) return <Link href="/consent/notices" className="btn sm">Add to notice →</Link>;
  return null;
}

function FieldPicker({ activityId, purposeId, busy, run }: { activityId: string; purposeId: string; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [opts, setOpts] = useState<{ id: string; label: string }[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { getDataPickerAction(activityId, purposeId).then((d) => setOpts(d.suggested.map((f) => ({ id: f.id, label: f.path })))); }, [activityId, purposeId]);
  if (!opts) return <span className="cell-sub">Loading fields…</span>;
  if (opts.length === 0) return <span className="cell-sub">No DLP fields available for this activity’s systems.</span>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="stack" style={{ gap: 2, maxHeight: 160, overflow: "auto" }}>{opts.map((o) => <label key={o.id} className="row" style={{ gap: 8 }}><input type="checkbox" checked={sel.has(o.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })} /> <span className="cell-sub mono">{o.label}</span></label>)}</div>
      <div><button className="btn primary sm" disabled={busy || sel.size === 0} onClick={() => run(() => addDataAction(activityId, purposeId, [...sel]))}>Add {sel.size} field{sel.size === 1 ? "" : "s"}</button></div>
    </div>
  );
}

function SystemPicker({ activityId, purposeId, busy, run }: { activityId: string; purposeId: string; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [opts, setOpts] = useState<{ id: string; name: string; sub: string }[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { getVendorOptionsAction().then((vs) => setOpts(vs.map((x) => ({ id: x.id, name: x.name, sub: `${x.country} · ${x.contract === "expired" ? "contract expired" : x.contract === "none" ? "no contract" : "contract on file"}` })))); }, []);
  if (!opts) return <span className="cell-sub">Loading systems…</span>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="stack" style={{ gap: 2, maxHeight: 160, overflow: "auto" }}>{opts.map((o) => <label key={o.id} className="row" style={{ gap: 8 }}><input type="checkbox" checked={sel.has(o.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })} /> <span>{o.name} <span className="cell-sub">· {o.sub}</span></span></label>)}</div>
      <div><button className="btn primary sm" disabled={busy || sel.size === 0} onClick={() => run(() => addProcessorAction(activityId, purposeId, [...sel]))}>Add {sel.size} system{sel.size === 1 ? "" : "s"}</button></div>
    </div>
  );
}
