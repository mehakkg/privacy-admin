"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAction } from "@/app/actions/maskingpolicy";

const MP = "/data-flow/masking-policy";
const CHIPS = ["New field added", "Role needs more access", "Tightening protection"];

/**
 * Reason (required) + Activate, as a sticky bottom bar. When blocked, the primary
 * reads "Fix N issues" and scrolls to the top where the issues are listed. No
 * faint disabled primary: the reason is validated on click.
 */
export function ActivateForm({ vid, number, blocked, issueCount, firstActivation }: { vid: string; number: number; blocked: boolean; issueCount: number; firstActivation?: boolean }) {
  const router = useRouter();
  const chips = firstActivation ? [...CHIPS, "First policy for our applications"] : CHIPS;
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onPrimary = () => {
    if (blocked) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!why.trim()) { setErr("Add a reason. It's recorded in the Audit Trail."); document.getElementById("mp-reason")?.focus(); return; }
    start(async () => {
      const r = await activateAction(vid, why);
      if (r.ok) router.push(`${MP}?view=live&n=${number}`);
      else setErr(r.error ?? "Couldn't activate.");
    });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <label className="fld" htmlFor="mp-reason"><span>Why are you making this change?</span>
          <textarea id="mp-reason" className="input" rows={2} value={why} onChange={(e) => { setWhy(e.target.value); setErr(null); }} placeholder="Recorded permanently in the Audit Trail." />
        </label>
        {err && <p className="cell-sub" style={{ color: "var(--red)", margin: "4px 0 0" }}>{err}</p>}
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {chips.map((c) => <button key={c} className="mp-filterchip" onClick={() => { setWhy((w) => (w ? w + " " : "") + c); setErr(null); }}>{c}</button>)}
        </div>
      </div>
      <div className="mp-activate-bar">
        <span className="cell-sub">Applies in seconds. Version {number - 1} stays in history. Approval comes later.</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => router.push(`${MP}?view=workspace`)}>Back to draft</button>
          <button className="btn primary" disabled={pending} onClick={onPrimary}>{pending ? "Activating…" : blocked ? `Fix ${issueCount} issues` : `Activate version ${number}`}</button>
        </div>
      </div>
    </div>
  );
}
