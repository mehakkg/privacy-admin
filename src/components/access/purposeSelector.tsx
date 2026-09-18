"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/ui";

export interface Opt { id: string; name: string }

/** The legal bases a proposed purpose can carry (DPO ratifies the choice). */
export const LEGAL_BASIS_OPTIONS: { value: string; label: string }[] = [
  { value: "consent", label: "Consent" },
  { value: "legitimate_use", label: "Legitimate use (S.7)" },
  { value: "contractual_necessity", label: "Contractual necessity" },
];

export type PurposeChoice =
  | { mode: "none" }
  | { mode: "existing"; existingPurposeTagId: string | null; processorId: string | null }
  | { mode: "propose"; proposed: { name: string; description: string; legalBasis: string } };

/**
 * Controlled purpose picker with the two-tab pattern: "Use existing purpose"
 * (search the approved catalogue + optional processor) or "Propose new purpose"
 * (name, one-line description, required legal basis, and the linked element shown
 * as fixed context). The parent owns the value so it works both as a standalone
 * request and as a sub-section of the Add Element form.
 */
export function PurposeSelector({
  value, onChange, purposes, processors, elementName, allowNone = false,
}: {
  value: PurposeChoice;
  onChange: (v: PurposeChoice) => void;
  purposes: Opt[];
  processors: Opt[];
  elementName: string;
  allowNone?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purposes.slice(0, 6);
    return purposes.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, purposes]);

  const mode = value.mode;
  const setExisting = () => onChange({ mode: "existing", existingPurposeTagId: null, processorId: null });
  const setPropose = () => onChange({ mode: "propose", proposed: { name: "", description: "", legalBasis: "" } });

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className={`btn sm${mode === "existing" ? " primary" : " ghost"}`} onClick={setExisting}>Use existing purpose</button>
        <button type="button" className={`btn sm${mode === "propose" ? " primary" : " ghost"}`} onClick={setPropose}>Propose new purpose</button>
        {allowNone && <button type="button" className={`btn sm${mode === "none" ? " primary" : " ghost"}`} onClick={() => onChange({ mode: "none" })}>Decide later</button>}
      </div>

      {mode === "none" && (
        <p className="cell-sub" style={{ margin: 0 }}>The element will be added unassigned — you can request or propose a purpose for it later.</p>
      )}

      {mode === "existing" && (
        <div className="stack" style={{ gap: 10 }}>
          <input className="input" placeholder="Search approved purposes…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="stack" style={{ gap: 4 }}>
            {matches.map((p) => {
              const on = value.mode === "existing" && value.existingPurposeTagId === p.id;
              return (
                <button type="button" key={p.id} className={`pick-item${on ? " on" : ""}`} onClick={() => onChange({ mode: "existing", existingPurposeTagId: p.id, processorId: value.mode === "existing" ? value.processorId : null })}>
                  <span className="cell-primary">{p.name}</span>
                  <span className="cell-sub">Existing approved purpose</span>
                </button>
              );
            })}
            {matches.length === 0 && (
              <span className="cell-sub">No approved purpose matches “{query}”. Try <button type="button" className="linklike" onClick={setPropose}>proposing a new one</button>.</span>
            )}
          </div>
          <div>
            <div className="section-label">Processor</div>
            <select className="input" value={value.mode === "existing" ? value.processorId ?? "" : ""} onChange={(e) => onChange({ mode: "existing", existingPurposeTagId: value.mode === "existing" ? value.existingPurposeTagId : null, processorId: e.target.value || null })}>
              <option value="">Internal — no processor</option>
              {processors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {mode === "propose" && value.mode === "propose" && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <div className="section-label">Purpose name</div>
            <input className="input" placeholder="e.g. Fraud-model training" value={value.proposed.name} onChange={(e) => onChange({ mode: "propose", proposed: { ...value.proposed, name: e.target.value } })} />
          </div>
          <div>
            <div className="section-label">One-line description</div>
            <input className="input" placeholder="Plain-English, as it will read in Approved Policy" value={value.proposed.description} onChange={(e) => onChange({ mode: "propose", proposed: { ...value.proposed, description: e.target.value } })} />
          </div>
          <div>
            <div className="section-label">Legal basis <span className="cell-sub">(required)</span></div>
            <select className="input" value={value.proposed.legalBasis} onChange={(e) => onChange({ mode: "propose", proposed: { ...value.proposed, legalBasis: e.target.value } })}>
              <option value="">Choose a legal basis…</option>
              {LEGAL_BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div className="section-label">Proposed for</div>
            <Pill tone="gray" dot={false}>{elementName}</Pill>
            <span className="cell-sub" style={{ marginLeft: 8 }}>fixed — this is the element the DPO sees context for.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether a choice is complete enough to submit. */
export function purposeChoiceValid(v: PurposeChoice): boolean {
  if (v.mode === "none") return true;
  if (v.mode === "existing") return Boolean(v.existingPurposeTagId);
  return Boolean(v.proposed.name.trim() && v.proposed.description.trim() && v.proposed.legalBasis);
}
