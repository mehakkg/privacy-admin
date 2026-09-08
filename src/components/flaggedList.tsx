"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { routeFlaggedToLegalAction, resolveFlaggedAction } from "@/app/actions/subProcessor";
import type { ActionResult } from "@/app/actions/requests";

export interface FlaggedRow {
  id: string;
  primaryVendor: string;
  suspected: string;
  firstDetected: string | null;
  flagStatus: string;
}

const FLAG_META: Record<string, { label: string; tone: "yellow" | "blue" | "green" }> = {
  under_investigation: { label: "Under investigation", tone: "yellow" },
  routed_to_legal: { label: "Routed to Legal", tone: "blue" },
  resolved: { label: "Resolved", tone: "green" },
};

/**
 * SCREEN 3.4 — Undisclosed-Transfer Detection. Data moving to a party matching no
 * registered vendor or approved disclosure, detected off the flow map. Each flag
 * has a "Route to Legal" action (Screen 3.5), which reuses the Escalation queue.
 */
export function FlaggedList({ rows }: { rows: FlaggedRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Flagged flow</th><th>Suspected party</th><th>First detected</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const meta = FLAG_META[r.flagStatus] ?? FLAG_META.under_investigation;
              return (
                <tr key={r.id}>
                  <td className="cell-primary">{r.primaryVendor} → {r.suspected}</td>
                  <td className="cell-sub">{r.suspected}</td>
                  <td className="cell-sub">{r.firstDetected ?? "—"}</td>
                  <td><Pill tone={meta.tone}>{meta.label}</Pill></td>
                  <td>
                    {r.flagStatus === "resolved" ? <span className="cell-sub">—</span> : (
                      <span className="row" style={{ gap: 6 }}>
                        <button className="btn primary xs" disabled={pending || r.flagStatus === "routed_to_legal"} onClick={() => run(() => routeFlaggedToLegalAction(r.id))}>Route to Legal</button>
                        <button className="btn ghost xs" disabled={pending} onClick={() => run(() => resolveFlaggedAction(r.id))}>Covered by DPA</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5}><div className="empty"><p style={{ margin: 0 }}>No undisclosed transfers detected. Every data destination matches a registered vendor or approved disclosure.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="cell-sub" style={{ marginTop: 10 }}>
        Routing sends the flow to Legal as an escalation (DPA check). See <Link href="/escalations" className="row-link">Escalations</Link>. Detection runs continuously against the live flow map.
      </p>
      <ActionError result={result} />
    </div>
  );
}
