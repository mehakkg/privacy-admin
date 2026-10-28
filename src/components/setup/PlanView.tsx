"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PlanRow } from "@/lib/setup/plan";
import { markPlanViewedAction } from "@/app/actions/setup";

const SETUP_STATUS: Record<string, string> = { security: "Partly done (IAM detected)" };

/** S5 — the plan. Countdown computed from today; obligations split into applies /
 *  doesn't-apply with reasons; footer disclaimer kept. */
export function PlanView({ applies, doesntApply, days, enforced, consentManagerLive, role }: {
  applies: PlanRow[]; doesntApply: PlanRow[]; days: number; enforced: boolean; consentManagerLive: boolean; role: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => { markPlanViewedAction(role); }, [role]);
  const isAdmin = role === "admin";

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-sunken, #f8fafc)", padding: "40px 16px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }} className="stack">
        <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 20 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent, #2563eb)", display: "inline-block" }} />
          <strong>miniOrange Privacy</strong>
        </div>

        <h1 className="inv-title" style={{ margin: "0 0 14px" }}>Meridian’s DPDP plan</h1>

        <div className="inv-card" style={{ background: "var(--accent, #2563eb)", color: "#fff", borderColor: "transparent" }}>
          <div className="row" style={{ alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            {enforced
              ? <strong style={{ fontSize: 22 }}>In force since 13 May 2027</strong>
              : <><strong style={{ fontSize: 30 }} className="tnum">{days} days</strong><span>until Rules 3 and 5–16 apply · 13 May 2027</span></>}
          </div>
          <div style={{ opacity: 0.85, fontSize: 12.5, marginTop: 4 }}>Rule 4 (Consent Managers) {consentManagerLive ? "applied from" : "applies from"} 13 Nov 2026.</div>
        </div>

        <section className="stack" style={{ gap: 8, marginTop: 20 }}>
          <strong>Applies to you</strong>
          <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="av-table" style={{ margin: 0 }}>
              <thead><tr><th>Obligation</th><th>Source</th><th>In the product</th><th>Setup</th></tr></thead>
              <tbody>
                {applies.map((o) => (
                  <tr key={o.id}>
                    <td><span className="av-name">{o.label}</span>{o.reason && <div className="cell-sub">{o.reason}</div>}</td>
                    <td className="cell-sub">{o.source}</td>
                    <td className="cell-sub">{o.module}</td>
                    <td className="cell-sub">{SETUP_STATUS[o.id] ?? "Not started"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stack" style={{ gap: 8, marginTop: 16 }}>
          <button className="row" style={{ gap: 6, alignItems: "center", background: "none", border: 0, cursor: "pointer", padding: 0, fontWeight: 600 }} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Doesn’t apply right now · {doesntApply.length}
          </button>
          {open && (
            <div className="inv-card stack" style={{ gap: 10 }}>
              {doesntApply.map((o) => (
                <div key={o.id} className="stack" style={{ gap: 1 }}>
                  <span style={{ fontSize: 13 }}>{o.label}</span>
                  <span className="cell-sub">{o.source} · <em>{o.reason}</em></span>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="cell-sub" style={{ fontSize: 12, marginTop: 14 }}>This plan summarises obligations under the DPDP Act, 2023 and Rules, 2025 to help you set up the platform. It isn’t legal advice.</p>

        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn primary" onClick={() => router.push("/setup")}>{isAdmin ? "Start setup" : "See my setup tasks"}</button>
          <button className="btn sec" onClick={() => window.print()}>Download plan (PDF)</button>
        </div>
      </div>
    </div>
  );
}
