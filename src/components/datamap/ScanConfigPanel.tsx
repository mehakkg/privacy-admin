"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { saveScanConfigAction } from "@/app/actions/sourceSync";
import type { ActionResult } from "@/app/actions/requests";

const SCHEDULES = [
  { v: "on_demand", l: "On demand" }, { v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" },
];
const DEPTHS = [
  { v: "shallow", l: "Shallow — column names only" }, { v: "standard", l: "Standard — sampled values" }, { v: "deep", l: "Deep — full profiling" },
];

/** Real, in-product scan configuration for a manually-added source (a DLP-synced
 *  source defers this to DLP and is read-only). */
export function ScanConfigPanel({ sourceId, schedule, depth, noConnection }: { sourceId: string; schedule: string; depth: string; noConnection: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sched, setSched] = useState(schedule);
  const [dep, setDep] = useState(depth);

  const save = () => start(async () => { const r = await saveScanConfigAction(sourceId, sched, dep); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <ActionError result={result} />
      {result?.ok && <Notice tone="ok" title="Scan configuration saved">This manually-added source will scan on the configured cadence.</Notice>}

      {noConnection && (
        <Notice tone="warn" title="No automated scan — configure a connection or run manual review">
          This source has no live connection yet, so an automated scan can&rsquo;t run. Set a cadence below for when a connection is added, or review its data manually in the meantime.
        </Notice>
      )}

      <label className="fld"><span>Scan cadence</span>
        <select className="input" value={sched} onChange={(e) => setSched(e.target.value)}>{SCHEDULES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      </label>
      <label className="fld"><span>Scan depth</span>
        <select className="input" value={dep} onChange={(e) => setDep(e.target.value)}>{DEPTHS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</select>
      </label>
      <div>
        <button className="btn primary" disabled={pending || (sched === schedule && dep === depth)} onClick={save}><Save size={14} /> {pending ? "Saving…" : "Save scan configuration"}</button>
      </div>
      <p className="cell-sub">Configured in-product because this source was manually added and has no DLP counterpart to defer to.</p>
    </div>
  );
}
