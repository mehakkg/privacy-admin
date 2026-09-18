"use client";

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { lawfulBasisLabel } from "@/lib/processingActivity";

export interface Opt { id: string; name: string; retention?: string | null; lawfulBasis?: string | null }

/** The legal bases a proposed purpose can carry (DPO ratifies the choice). */
export const LEGAL_BASIS_OPTIONS: { value: string; label: string }[] = [
  { value: "consent", label: "Consent" },
  { value: "legitimate_use", label: "Legitimate use (S.7)" },
  { value: "contractual_necessity", label: "Contractual necessity" },
];

export type PurposeChoice =
  | { mode: "none" }
  | { mode: "existing"; existingPurposeTagId: string | null; processorId: string | null }
  | { mode: "propose"; proposed: { name: string; description: string; legalBasis: string; retention: string }; processorId: string | null };

/**
 * Purpose-first selector: you declare the purpose (existing / proposed / decide
 * later), and Retention + Processor attach to the PURPOSE right here — not the
 * element. For an existing approved purpose, retention + legal basis are shown
 * locked (DPO-owned); for a proposal, they are part of what the DPO approves.
 */
export function PurposeSelector({
  value, onChange, purposes, processors, allowNone = false,
}: {
  value: PurposeChoice;
  onChange: (v: PurposeChoice) => void;
  purposes: Opt[];
  processors: Opt[];
  allowNone?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purposes.slice(0, 6);
    return purposes.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, purposes]);

  const mode = value.mode;
  const processorId = value.mode === "existing" || value.mode === "propose" ? value.processorId : null;
  const setProcessor = (pid: string | null) => {
    if (value.mode === "existing") onChange({ ...value, processorId: pid });
    else if (value.mode === "propose") onChange({ ...value, processorId: pid });
  };
  const chosen = value.mode === "existing" && value.existingPurposeTagId ? purposes.find((p) => p.id === value.existingPurposeTagId) : null;

  const ProcessorField = (
    <div>
      <div className="section-label">Processor <span className="cell-sub">(this purpose)</span></div>
      <select className="input" value={processorId ?? ""} onChange={(e) => setProcessor(e.target.value || null)}>
        <option value="">Internal — no processor</option>
        {processors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className={`btn sm${mode === "existing" ? " primary" : " ghost"}`} onClick={() => onChange({ mode: "existing", existingPurposeTagId: null, processorId: null })}>Use existing purpose</button>
        <button type="button" className={`btn sm${mode === "propose" ? " primary" : " ghost"}`} onClick={() => onChange({ mode: "propose", proposed: { name: "", description: "", legalBasis: "", retention: "" }, processorId: null })}>Propose new purpose</button>
        {allowNone && <button type="button" className={`btn sm${mode === "none" ? " primary" : " ghost"}`} onClick={() => onChange({ mode: "none" })}>Decide later</button>}
      </div>

      {mode === "none" && (
        <p className="cell-sub" style={{ margin: 0 }}>This purpose segment will be created with no purpose chosen yet. You declare the purpose before adding fields under it.</p>
      )}

      {mode === "existing" && (
        <div className="stack" style={{ gap: 10 }}>
          <input className="input" placeholder="Search approved purposes…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="stack" style={{ gap: 4 }}>
            {matches.map((p) => {
              const on = value.mode === "existing" && value.existingPurposeTagId === p.id;
              return (
                <button type="button" key={p.id} className={`pick-item${on ? " on" : ""}`} onClick={() => onChange({ mode: "existing", existingPurposeTagId: p.id, processorId })}>
                  <span className="cell-primary">{p.name}</span>
                  <span className="cell-sub">Existing approved purpose{p.retention ? ` · retention ${p.retention}` : ""}</span>
                </button>
              );
            })}
            {matches.length === 0 && <span className="cell-sub">No approved purpose matches “{query}”. Try <button type="button" className="linklike" onClick={() => onChange({ mode: "propose", proposed: { name: query.trim(), description: "", legalBasis: "", retention: "" }, processorId })}>proposing a new one</button>.</span>}
          </div>
          {chosen && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="lock-inline"><Lock size={12} /> Retention: {chosen.retention ?? "—"}</span>
                {chosen.lawfulBasis && <Chip>{lawfulBasisLabel(chosen.lawfulBasis)}</Chip>}
              </span>
              <span className="cell-sub">Retention &amp; legal basis are DPO-owned on this purpose and shown locked.</span>
            </div>
          )}
          {ProcessorField}
        </div>
      )}

      {mode === "propose" && value.mode === "propose" && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <div className="section-label">Purpose name</div>
            <input className="input" placeholder="e.g. Fraud-model training" value={value.proposed.name} onChange={(e) => onChange({ ...value, proposed: { ...value.proposed, name: e.target.value } })} />
          </div>
          <div>
            <div className="section-label">One-line description</div>
            <input className="input" placeholder="Plain-English, as it will read in Approved Policy" value={value.proposed.description} onChange={(e) => onChange({ ...value, proposed: { ...value.proposed, description: e.target.value } })} />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <div className="section-label">Legal basis <span className="cell-sub">(required)</span></div>
              <select className="input" value={value.proposed.legalBasis} onChange={(e) => onChange({ ...value, proposed: { ...value.proposed, legalBasis: e.target.value } })}>
                <option value="">Choose a legal basis…</option>
                {LEGAL_BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div className="section-label">Retention <span className="cell-sub">(required)</span></div>
              <input className="input" placeholder="e.g. 365 days / until deletion" value={value.proposed.retention} onChange={(e) => onChange({ ...value, proposed: { ...value.proposed, retention: e.target.value } })} />
            </div>
          </div>
          {ProcessorField}
          <Pill tone="yellow">Retention, legal basis &amp; processor go to the DPO for approval with this purpose.</Pill>
        </div>
      )}
    </div>
  );
}

/** Whether a choice is complete enough to submit. */
export function purposeChoiceValid(v: PurposeChoice): boolean {
  if (v.mode === "none") return true;
  if (v.mode === "existing") return Boolean(v.existingPurposeTagId);
  return Boolean(v.proposed.name.trim() && v.proposed.description.trim() && v.proposed.legalBasis && v.proposed.retention.trim());
}
