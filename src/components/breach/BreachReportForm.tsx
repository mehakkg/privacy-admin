"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { reportBreachAction } from "@/app/actions/breach";
import { breachSeverity, SEVERITY_TONE } from "@/lib/breach";
import type { ActionResult } from "@/app/actions/requests";

const PII = ["basic", "contact", "transaction", "financial", "kyc", "health", "children"];

export function BreachReportForm({ reportedVia, entities = [], onDone }: { reportedVia: "internal" | "public_self_service"; entities?: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [volume, setVolume] = useState("100");
  const [piiType, setPiiType] = useState("contact");
  const [sensitivity, setSensitivity] = useState("medium");
  const [entityId, setEntityId] = useState("");

  // Live preview of the auto-computed severity (same engine as the server).
  const sev = useMemo(() => breachSeverity({ volume: Number(volume) || 0, piiType, sensitivity }), [volume, piiType, sensitivity]);

  const submit = () => start(async () => {
    const r = await reportBreachAction({ reportedVia, category, reporterNote: note, volume: Number(volume) || 0, piiType, sensitivity, entityId: entityId || null });
    setResult(r);
    if (r.ok) { setDone(true); onDone?.(); router.refresh(); }
  });

  if (done && reportedVia === "public_self_service") {
    return (
      <div className="empty" style={{ padding: 32, textAlign: "center" }}>
        <p style={{ fontWeight: 600, margin: "0 0 6px" }}>Thank you — your report has been submitted.</p>
        <p className="cell-sub" style={{ margin: 0 }}>Our data-protection team has been notified and will assess it immediately. You don&rsquo;t need to do anything further.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="section-label">What happened? <span className="cell-sub">(required)</span></div>
        <textarea className="input" rows={3} placeholder="Describe the incident — what data, how it was exposed, when you noticed…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div className="section-label">Category</div>
          <input className="input" placeholder="e.g. Unauthorized access, Misdirected email" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        {entities.length > 0 && (
          <div style={{ flex: "1 1 180px" }}>
            <div className="section-label">Entity (if known)</div>
            <select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">Not sure</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <div className="section-label">Approx. people affected</div>
          <input className="input" type="number" min={0} value={volume} onChange={(e) => setVolume(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <div className="section-label">Most sensitive data type</div>
          <select className="input" value={piiType} onChange={(e) => setPiiType(e.target.value)}>{PII.map((p) => <option key={p} value={p} style={{ textTransform: "capitalize" }}>{p}</option>)}</select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <div className="section-label">Sensitivity</div>
          <select className="input" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
        </div>
      </div>

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="cell-sub">Auto-assessed severity:</span>
        <Pill tone={SEVERITY_TONE[sev.severity]}>{sev.severity}</Pill>
        <span className="cell-sub">— computed from volume × data type × sensitivity; the team may re-assess on triage.</span>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={pending || !note.trim()} onClick={submit}>{pending ? "Submitting…" : reportedVia === "public_self_service" ? "Submit report" : "Create incident"}</button>
        {onDone && <button className="btn ghost" onClick={onDone}>Cancel</button>}
      </div>
      <ActionError result={result} />
    </div>
  );
}
