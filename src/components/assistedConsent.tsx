"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionError } from "@/components/actions";
import { captureBranchConsentAction, retrySyncAction } from "@/app/actions/consent";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Branch capture — a plain form, not a wizard. In-person identity verification
 * is a required field (ID document + staff witness), not an OTP: the whole
 * point of assisted capture is that the person is physically present.
 */
export function BranchCaptureForm({ purposes }: { purposes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [subjectRef, setSubjectRef] = useState("");
  const [purposeTagId, setPurposeTagId] = useState("");
  const [idDoc, setIdDoc] = useState("");
  const [witness, setWitness] = useState(true);
  const [offline, setOffline] = useState(false);

  const submit = () => {
    const idVerification = `${idDoc}${witness ? " + staff witness" : ""}`;
    start(async () => {
      const r = await captureBranchConsentAction(subjectRef, purposeTagId, idVerification, offline);
      setResult(r);
      if (r.ok) {
        setSubjectRef("");
        setPurposeTagId("");
        setIdDoc("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="section-label">Customer reference</div>
      <input className="input" placeholder="e.g. CUST-889100" value={subjectRef} onChange={(e) => setSubjectRef(e.target.value)} />

      <div className="section-label" style={{ marginTop: 12 }}>
        Consent for
      </div>
      <select className="input" value={purposeTagId} onChange={(e) => setPurposeTagId(e.target.value)}>
        <option value="">— choose a purpose —</option>
        {purposes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="section-label" style={{ marginTop: 12 }}>
        In-person identity verification
      </div>
      <select className="input" value={idDoc} onChange={(e) => setIdDoc(e.target.value)}>
        <option value="">— ID document sighted —</option>
        <option value="PAN card">PAN card</option>
        <option value="Aadhaar (masked)">Aadhaar (masked)</option>
        <option value="Passport">Passport</option>
        <option value="Driving licence">Driving licence</option>
      </select>
      <label className="row" style={{ gap: 8, marginTop: 8 }}>
        <input type="checkbox" checked={witness} onChange={(e) => setWitness(e.target.checked)} />
        <span>Confirmed in person by branch staff</span>
      </label>

      <label className="row" style={{ gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
        <span>Capturing offline (branch has no connection right now)</span>
      </label>
      {offline && (
        <p className="cell-sub" style={{ margin: "4px 0 0 24px" }}>
          Saved locally as <strong>pending</strong>; it syncs to the central store
          and is sealed with an integrity hash once connectivity returns.
        </p>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={pending} onClick={submit}>
          {pending ? "Recording…" : "Record consent"}
        </button>
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function RetrySyncButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <button
        className="btn xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await retrySyncAction(recordId);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : "Retry sync"}
      </button>
      <ActionError result={result} />
    </div>
  );
}
