"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Info, Moon } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { scheduleScanAction } from "@/app/actions/scenario4";
import { SOURCE_KIND_LABEL, SUGGESTED_OFF_PEAK } from "@/lib/scenario4";
import type { ActionResult } from "@/app/actions/requests";

export interface PickerSource { id: string; name: string; kind: string; large: boolean; schedule: string; offPeak: string | null }

export function ScanConfigPicker({ approved, unapproved }: { approved: PickerSource[]; unapproved: { name: string; reason: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("daily");
  const [offPeak, setOffPeak] = useState("");
  const [showWhy, setShowWhy] = useState(false);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const anyLarge = approved.some((s) => selected.includes(s.id) && s.large);

  const submit = () => start(async () => {
    const r = await scheduleScanAction(selected, schedule, offPeak.trim() || (anyLarge ? SUGGESTED_OFF_PEAK : null));
    setResult(r);
    if (r.ok) { setSelected([]); router.refresh(); }
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <ActionError result={result} />
      <div className="card">
        <div className="card-head">Select approved sources</div>
        <div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>Only DPO-approved sources appear here. A scan can never run against a source outside approved scope.</p>
          {approved.map((s) => (
            <label key={s.id} className="pick-row">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
              <span className="cell-primary">{s.name}</span>
              <Pill tone="gray" dot={false}>{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</Pill>
              {s.large && <Pill tone="yellow" dot={false}>Large</Pill>}
            </label>
          ))}
          {approved.length === 0 && <div className="empty">No sources are approved for scanning yet.</div>}
          {unapproved.length > 0 && (
            <p style={{ marginTop: 10 }}>
              <button className="btn ghost xs" onClick={() => setShowWhy(!showWhy)}><Info size={12} /> {showWhy ? "Hide" : `Why are ${unapproved.length} source(s) not selectable?`}</button>
              {showWhy && <ul className="cell-sub" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{unapproved.map((u, n) => <li key={n}>{u.name} — {u.reason}</li>)}</ul>}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><CalendarClock size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Schedule</div>
        <div className="card-body">
          <label className="fld"><span>Frequency</span>
            <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              <option value="on_demand">On demand</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="fld"><span>Off-peak window (HH:MM-HH:MM)</span>
            <input className="input" placeholder={anyLarge ? SUGGESTED_OFF_PEAK : "optional"} value={offPeak} onChange={(e) => setOffPeak(e.target.value)} />
          </label>
          {anyLarge && (
            <Notice tone="info" title="Large source selected — off-peak recommended">
              <Moon size={13} style={{ verticalAlign: "-2px" }} /> One or more selected sources are large. We suggest running overnight ({SUGGESTED_OFF_PEAK}) to avoid the timeouts these sources have hit before. Leave the window blank to apply this automatically.
            </Notice>
          )}
          <button className="btn primary" style={{ marginTop: 12 }} disabled={pending || selected.length === 0} onClick={submit}>Configure &amp; schedule scan ({selected.length})</button>
        </div>
      </div>
    </div>
  );
}
