"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { proposeCookieCategoryAction, decideCookieCategoryAction } from "@/app/actions/scenario6";
import type { ActionResult } from "@/app/actions/requests";

export interface CatRow { id: string; name: string; description: string; defaultState: string; status: string; custom: boolean; proposedBy: string | null }

export function CookieCategoryManager({ standard, pending: pendingRows, live, role }: { standard: CatRow[]; pending: CatRow[]; live: CatRow[]; role: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({ name: "", description: "", defaultState: "off" });
  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  const canApprove = role === "dpo" || role === "admin";

  const Row = ({ c, readonly }: { c: CatRow; readonly?: boolean }) => (
    <div className="pick-row">
      <span className="cell-primary" style={{ flex: 1 }}>{c.name}{readonly && <Lock size={11} style={{ verticalAlign: "-1px", marginLeft: 6, color: "var(--text-3)" }} />}<div className="cell-sub">{c.description}</div></span>
      <Pill tone={c.defaultState === "on" ? "green" : "gray"} dot={false}>default {c.defaultState}</Pill>
    </div>
  );

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div>
        <ActionError result={result} />
        <div className="card">
          <div className="card-head">Standard categories <span className="cell-sub">DPO-owned · read-only</span></div>
          <div className="card-body">
            {standard.map((c) => <Row key={c.id} c={c} readonly />)}
            <p className="cell-sub" style={{ marginTop: 8 }}>The four standard categories are grounded in law (strictly-necessary needs no consent; the rest default off until the user opts in).</p>
          </div>
        </div>

        {live.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">Approved custom categories</div>
            <div className="card-body">{live.map((c) => <Row key={c.id} c={c} />)}</div>
          </div>
        )}

        {pendingRows.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">Pending DPO approval</div>
            <div className="card-body">
              {pendingRows.map((c) => (
                <div key={c.id} className="pick-row">
                  <span className="cell-primary" style={{ flex: 1 }}>{c.name}<div className="cell-sub">{c.description} · proposed by {c.proposedBy}</div></span>
                  <Pill tone="yellow" dot={false}>default {c.defaultState}</Pill>
                  {canApprove
                    ? <span className="row" style={{ gap: 6 }}><button className="btn xs" disabled={busy} onClick={() => run(() => decideCookieCategoryAction(c.id, false))}>Reject</button><button className="btn xs primary" disabled={busy} onClick={() => run(() => decideCookieCategoryAction(c.id, true))}>Approve</button></span>
                    : <span className="cell-sub"><Lock size={11} style={{ verticalAlign: "-1px" }} /> awaiting DPO</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">Propose a custom category</div>
        <div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>A custom category goes live only once the DPO approves — same pattern as proposing a purpose. Set its default on/off state here in the same place.</p>
          <label className="fld"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Personalisation" /></label>
          <label className="fld"><span>Description</span><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="fld"><span>Default state</span>
            <select className="input" value={f.defaultState} onChange={(e) => setF({ ...f, defaultState: e.target.value })}><option value="off">Off (opt-in)</option><option value="on">On</option></select>
          </label>
          <button className="btn primary" disabled={busy || !f.name.trim() || !f.description.trim()} onClick={() => run(() => proposeCookieCategoryAction(f.name, f.description, f.defaultState), () => setF({ name: "", description: "", defaultState: "off" }))}><Plus size={14} /> Propose for DPO approval</button>
          {f.defaultState === "on" && <Notice tone="warn" title="Non-necessary categories usually default off">Only strictly-necessary cookies default on. Defaulting a custom category on will get extra DPO scrutiny.</Notice>}
        </div>
      </div>
    </div>
  );
}
