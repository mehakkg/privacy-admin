"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileText, UserCheck, Smartphone } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { recordIdentityVerificationAction } from "@/app/actions/omnichannel";
import { ID_METHOD_LABEL, idMethodRequirement } from "@/lib/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

export interface VerifiedRow { id: string; method: string; documentType: string | null; attestingEmployeeId: string | null; verifiedAt: string; consumed: boolean }

const METHOD_ICON: Record<string, React.ReactNode> = {
  otp: <Smartphone size={14} />, in_person_document: <FileText size={14} />, assisted_attestation: <UserCheck size={14} />,
};

export function IdentityVerificationForm({ docTypes, recent }: { docTypes: { label: string; note: string | null }[]; recent: VerifiedRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [method, setMethod] = useState("in_person_document");
  const [documentType, setDocumentType] = useState("");
  const [attestingEmployeeId, setAttestingEmployeeId] = useState("");

  const need = idMethodRequirement(method);
  const canSubmit = need === "document_type" ? documentType.trim().length > 0
    : need === "attesting_employee_id" ? attestingEmployeeId.trim().length > 0
    : true;

  const submit = () => start(async () => {
    const r = await recordIdentityVerificationAction({ method, documentType, attestingEmployeeId });
    setResult(r);
    if (r.ok) { setDocumentType(""); setAttestingEmployeeId(""); router.refresh(); }
  });

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head">Verify identity</div>
        <div className="card-body">
          <ActionError result={result} />
          {result?.ok && <Notice tone="ok" title="Identity verification recorded">This documented verification can now unblock one assisted request.</Notice>}

          <div className="section-label">Method</div>
          <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
            {(["otp", "in_person_document", "assisted_attestation"] as const).map((m) => (
              <label key={m} className={`cap-row${method === m ? " on" : ""}`}>
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                <span className="row" style={{ gap: 6 }}>{METHOD_ICON[m]} <span className="cell-primary">{ID_METHOD_LABEL[m]}</span></span>
              </label>
            ))}
          </div>

          {need === "document_type" && (
            <label className="fld"><span>Document type <span className="cell-sub">(required)</span></span>
              <input className="input" list="doc-types" value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="e.g. Passport" />
              <datalist id="doc-types">{docTypes.map((d) => <option key={d.label} value={d.label} />)}</datalist>
            </label>
          )}
          {need === "attesting_employee_id" && (
            <label className="fld"><span>Attesting employee ID <span className="cell-sub">(required)</span></span>
              <input className="input" value={attestingEmployeeId} onChange={(e) => setAttestingEmployeeId(e.target.value)} placeholder="e.g. EMP-3391" />
            </label>
          )}
          {need === null && <p className="cell-sub">An OTP to the registered contact completes verification directly.</p>}

          <button className="btn primary" style={{ marginTop: 10 }} disabled={pending || !canSubmit} onClick={submit}>
            <ShieldCheck size={14} /> {pending ? "Recording…" : "Record verification"}
          </button>
          <p className="cell-sub" style={{ marginTop: 8 }}>&ldquo;Verified&rdquo; is only reachable through a specific method path — never a bare checkbox. The assisted request is blocked server-side until this exists.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="card">
          <div className="card-head">Acceptable documents <span className="cell-sub">policy-managed</span></div>
          <div className="card-body">
            {docTypes.length === 0 && <p className="cell-sub">No document types configured.</p>}
            {docTypes.map((d) => (
              <div key={d.label} className="pick-row"><FileText size={13} className="cell-sub" /><span className="cell-primary" style={{ flex: 1 }}>{d.label}</span>{d.note && <span className="cell-sub">{d.note}</span>}</div>
            ))}
            <p className="cell-sub" style={{ marginTop: 8 }}>This list is content-managed — it updates as policy changes, no code deploy needed.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">Recent verifications</div>
          <div className="card-body">
            {recent.length === 0 && <p className="cell-sub">None yet.</p>}
            {recent.map((v) => (
              <div key={v.id} className="pick-row">
                <span className="row" style={{ gap: 6, flex: 1 }}>{METHOD_ICON[v.method]}<span className="cell-primary">{ID_METHOD_LABEL[v.method]}</span></span>
                <span className="cell-sub">{v.documentType ?? v.attestingEmployeeId ?? "OTP"}</span>
                <Pill tone={v.consumed ? "gray" : "green"} dot={false}>{v.consumed ? "Used" : "Available"}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
