"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Play } from "lucide-react";
import { Notice, Pill, Stat } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { setScanCadenceAction, runScheduledScanAction } from "@/app/actions/cookieCompliance";
import { SCAN_CADENCE_LABEL } from "@/lib/cookieCompliance";
import type { ActionResult } from "@/app/actions/requests";

export function ScanScheduleForm({ cadence, lastRunAt, nextRunAt }: { cadence: string; lastRunAt: string | null; nextRunAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { flagged?: number }) | null>(null);
  const [sel, setSel] = useState(cadence);
  const run = (op: () => Promise<ActionResult & { flagged?: number }>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      {result?.ok && result.flagged !== undefined && <Notice tone="ok" title="Scheduled scan run">{result.flagged} flagged finding(s). The scheduled run used the same engine as a manual scan.</Notice>}

      <div className="stat-row">
        <Stat label="Cadence" value={SCAN_CADENCE_LABEL[cadence] ?? cadence} />
        <Stat label="Last run" value={lastRunAt ?? "never"} />
        <Stat label="Next run" value={nextRunAt ?? "—"} tone={nextRunAt ? "green" : undefined} />
      </div>

      <div className="card">
        <div className="card-head"><span className="row" style={{ gap: 6 }}><CalendarClock size={14} /> Scan schedule</span></div>
        <div className="card-body">
          <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
            {(["on_demand", "monthly"] as const).map((c) => (
              <label key={c} className={`cap-row${sel === c ? " on" : ""}`}>
                <input type="radio" name="cadence" checked={sel === c} onChange={() => setSel(c)} />
                <span className="cell-primary">{SCAN_CADENCE_LABEL[c]}</span>
                {c === "monthly" && <span className="cell-sub" style={{ marginLeft: "auto" }}>runs automatically each month</span>}
              </label>
            ))}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary sm" disabled={pending || sel === cadence} onClick={() => run(() => setScanCadenceAction(sel as "on_demand" | "monthly"))}>Save schedule</button>
            <button className="btn sm" disabled={pending} onClick={() => run(() => runScheduledScanAction())}><Play size={13} /> Run scheduled scan now</button>
            {cadence === "monthly" ? <Pill tone="green" dot={false}>Recurring active</Pill> : <Pill tone="gray" dot={false}>Manual-only</Pill>}
          </div>
          <p className="cell-sub" style={{ marginTop: 8 }}>The scan mechanism is unchanged — this only adds cadence. A scheduled run calls the same script-compliance engine as the manual trigger, tagging its findings <strong>scheduled</strong>.</p>
        </div>
      </div>
    </div>
  );
}
