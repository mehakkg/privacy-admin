"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { setDlpStateAction, syncDlpAction } from "@/app/actions/dlp";
import type { DlpState } from "@/lib/engines/dlp";

const STATES: { key: DlpState; label: string }[] = [
  { key: "connected", label: "Connected" },
  { key: "stale", label: "Out of date" },
  { key: "failed", label: "Sync failed" },
  { key: "not_connected", label: "Not connected" },
];

/** Demo switcher for the DLP connection health, so the nav warning states are
 *  reachable without a real DLP. Real integrations would read this from the DLP. */
export function DlpControls({ state }: { state: DlpState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn sm" disabled={pending} onClick={() => run(syncDlpAction)}><RefreshCw size={13} /> Sync now</button>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <span className="cell-sub">Demo: set the connection state to preview each warning.</span>
        <div className="mp-segment mp-segment-wrap">
          {STATES.map((s) => (
            <button key={s.key} className={state === s.key ? "on" : ""} disabled={pending} onClick={() => run(() => setDlpStateAction(s.key))}>{s.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
