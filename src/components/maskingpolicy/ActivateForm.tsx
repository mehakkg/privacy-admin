"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAction } from "@/app/actions/maskingpolicy";

const BASE = "/data-flow/masking-policy";
const CHIPS = ["New field added", "Role needs more access", "Tightening protection"];

/**
 * Required why-note + Activate. Blocking checks disable activation upstream (the
 * button is only shown when none block). The approval notice stays until a real
 * approval step ships.
 */
export function ActivateForm({ vid, number, blocked }: { vid: string; number: number; blocked: boolean }) {
  const router = useRouter();
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const activate = () => start(async () => {
    const r = await activateAction(vid, why);
    if (r.ok) router.push(`${BASE}?activated=${number}`);
    else setErr(r.error ?? "Failed.");
  });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="fld"><span>Why are you making this change?</span>
        <textarea className="input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Recorded permanently in the Audit Trail." />
      </label>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {CHIPS.map((c) => <button key={c} className="filter-chip" onClick={() => setWhy((w) => (w ? w + " " : "") + c)}>{c}</button>)}
      </div>
      <div className="notice info" style={{ margin: 0 }}>
        <div>Activating applies version {number} immediately in all your applications. Version {number - 1} is kept in your history. An approval step will be added with the workflow integration.</div>
      </div>
      {err && <div className="notice danger" style={{ margin: 0 }}><div className="notice-title">Can&rsquo;t activate</div><div>{err}</div></div>}
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => router.push(`${BASE}?view=workspace`)}>Back to draft</button>
        <button className="btn primary" disabled={blocked || !why.trim() || pending} onClick={activate}>{pending ? "Activating…" : `Activate version ${number}`}</button>
      </div>
    </div>
  );
}
