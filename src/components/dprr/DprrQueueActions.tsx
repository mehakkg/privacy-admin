"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Clock, Download } from "lucide-react";
import { ActionError } from "@/components/actions";
import { autoAssignAction, runDprrTickAction } from "@/app/actions/dprr";
import type { ActionResult } from "@/app/actions/requests";

export interface ExportRow {
  reference: string;
  type: string;
  principal: string;
  source: string;
  owner: string;
  routingState: string;
  originalDeadline: string;
  currentDeadline: string;
  slaLabel: string;
  boardEscalated: boolean;
}

export function DprrQueueActions({ rows }: { rows: ExportRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  const exportCsv = () => {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = ["Reference,Type,Data Principal,Source,Owner,Routing,Original deadline,Current deadline,SLA,Board-escalated"];
    for (const r of rows) {
      lines.push([r.reference, r.type, r.principal, r.source, r.owner, r.routingState, r.originalDeadline, r.currentDeadline, r.slaLabel, r.boardEscalated ? "yes" : "no"].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dprr-queue.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn sm" disabled={pending} onClick={() => run(() => autoAssignAction())}><Wand2 size={13} /> Run auto-assignment</button>
      <button className="btn sm" disabled={pending} onClick={() => run(() => runDprrTickAction())} title="Re-evaluates SLA thresholds and automatic Board escalation, as the scheduled job would."><Clock size={13} /> Run SLA tick</button>
      <button className="btn sm" onClick={exportCsv}><Download size={13} /> Export (audit evidence)</button>
      <ActionError result={result} />
    </div>
  );
}
