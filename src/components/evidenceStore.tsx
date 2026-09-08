"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { addEvidenceDocAction } from "@/app/actions/subProcessor";
import type { ActionResult } from "@/app/actions/requests";

export interface EvidenceDoc { name: string; docType: string; uploadedAt: string; expiresAt: string | null; daysToExpiry: number | null; fromDisclosure: boolean }
export interface VendorEvidence { vendorId: string; vendorName: string; docs: EvidenceDoc[] }

const DOC_TYPES = [
  { value: "certification", label: "Certification" },
  { value: "dpa", label: "DPA" },
  { value: "security", label: "Security attestation" },
  { value: "other", label: "Other" },
];

/**
 * SCREEN 3.6 — Evidence Package Store. A standing document library per vendor,
 * kept current so a short-notice audit is answered from a maintained store. The
 * documents attached to a disclosure (3.2 Step 3) populate this SAME library —
 * one upload mechanism, referenced in both places.
 */
export function EvidenceStore({ vendors }: { vendors: VendorEvidence[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("certification");
  const [expiry, setExpiry] = useState("");

  const add = (vendorId: string) =>
    start(async () => {
      const r = await addEvidenceDocAction(vendorId, name, docType, expiry || null);
      setResult(r);
      if (r.ok) { setName(""); setExpiry(""); setAddFor(null); router.refresh(); }
    });

  return (
    <div className="stack" style={{ gap: 16 }}>
      {vendors.map((v) => (
        <div key={v.vendorId} className="card"><div className="card-body">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{v.vendorName}</strong>
            {addFor === v.vendorId ? null : <button className="btn ghost sm" onClick={() => { setAddFor(v.vendorId); setName(""); setExpiry(""); }}><Plus size={13} /> Add document</button>}
          </div>

          {addFor === v.vendorId && (
            <div className="row" style={{ gap: 6, alignItems: "flex-end", marginBottom: 10 }}>
              <input className="input sm" placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} autoFocus />
              <select className="input sm" value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              <input className="input sm" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} title="Expiry (optional)" />
              <button className="btn primary sm" disabled={pending || !name.trim()} onClick={() => add(v.vendorId)}>Save</button>
              <button className="btn ghost sm" onClick={() => setAddFor(null)}>Cancel</button>
            </div>
          )}

          {v.docs.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No documents on file.</p> : (
            <div className="table-wrap">
              <table className="dtable">
                <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th>Expiry</th></tr></thead>
                <tbody>
                  {v.docs.map((doc, i) => {
                    const soon = doc.daysToExpiry !== null && doc.daysToExpiry < 30;
                    return (
                      <tr key={i}>
                        <td>{doc.name} {doc.fromDisclosure && <span className="cell-sub">· from disclosure</span>}</td>
                        <td className="cell-sub">{doc.docType}</td>
                        <td className="cell-sub">{doc.uploadedAt}</td>
                        <td>{doc.expiresAt ? (soon ? <Pill tone="red">{doc.expiresAt} ({doc.daysToExpiry}d)</Pill> : <span className="cell-sub">{doc.expiresAt}</span>) : <span className="cell-sub">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div></div>
      ))}
      <ActionError result={result} />
    </div>
  );
}
