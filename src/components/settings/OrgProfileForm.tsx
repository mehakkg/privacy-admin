"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { ActionError } from "@/components/actions";
import { saveOrgProfileAction, setEntityLegalNameAction } from "@/app/actions/orgProfile";
import type { ActionResult } from "@/app/actions/requests";

export interface EntityProfile { id: string; name: string; legalName: string | null }

const FIELD_NOTES: Record<string, string> = {
  legalName: "Appears on all consent notices and DSR correspondence.",
  displayName: "Shown in the preference-centre header and in emails to data principals.",
  industry: "Used to tailor risk templates and reporting — not shown to data principals.",
  address: "Appears in the privacy-notice footer and grievance correspondence.",
  contactEmail: "The address data principals reach you at for privacy matters.",
};

export function OrgProfileForm({
  initial, entities,
}: {
  initial: { legalName: string; displayName: string; industry: string; address: string; contactEmail: string };
  entities: EntityProfile[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState(initial);
  const [expanded, setExpanded] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => start(async () => { const r = await saveOrgProfileAction(f); setResult(r); if (r.ok) router.refresh(); });

  const Field = ({ k, label, required, placeholder }: { k: keyof typeof f; label: string; required?: boolean; placeholder?: string }) => (
    <div className="stack" style={{ gap: 3 }}>
      <label className="section-label">{label}{required && <span className="cell-sub"> (required)</span>}</label>
      <input className="input" value={f[k]} placeholder={placeholder} onChange={set(k)} />
      <span className="field-note">{FIELD_NOTES[k]}</span>
    </div>
  );

  return (
    <div className="settings-single">
      <div className="stack" style={{ gap: 14 }}>
        <Field k="legalName" label="Legal entity name" required placeholder="e.g. Meridian Financial Services Pvt. Ltd." />
        <Field k="displayName" label="Display name" placeholder="e.g. Meridian" />
        <Field k="industry" label="Industry" placeholder="e.g. Banking & financial services" />
        <Field k="address" label="Registered address" placeholder="Street, city, state, PIN" />
        <Field k="contactEmail" label="Primary contact email" placeholder="privacy@example.in" />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={pending || !f.legalName.trim()} onClick={save}>{pending ? "Saving…" : "Save profile"}</button>
      </div>
      <ActionError result={result} />

      {/* Per-entity profile — collapsed by default; reuses the Fiduciary entity list. */}
      <div className="settings-collapse">
        <button className="settings-collapse-head" onClick={() => setExpanded((x) => !x)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Manage per-entity profile
          <span className="cell-sub" style={{ marginLeft: 8 }}>Give a Fiduciary its own legal name — otherwise it inherits the org default.</span>
        </button>
        {expanded && (
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {entities.map((en) => (
              <EntityLegalNameRow key={en.id} entity={en} orgDefault={f.legalName} />
            ))}
            {entities.length === 0 && <span className="cell-sub">No entities yet.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityLegalNameRow({ entity, orgDefault }: { entity: EntityProfile; orgDefault: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(entity.legalName ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = (val.trim() || null) !== (entity.legalName ?? null);
  const save = () => start(async () => { const r = await setEntityLegalNameAction(entity.id, val); if (r.ok) { setSaved(true); router.refresh(); } });

  return (
    <div className="entity-row">
      <div className="stack" style={{ gap: 2, minWidth: 140 }}>
        <span className="cell-primary">{entity.name}</span>
        <span className="cell-sub">{entity.legalName ? "override set" : "inherits default"}</span>
      </div>
      <input className="input sm" value={val} placeholder={orgDefault || "Org default legal name"} onChange={(e) => { setVal(e.target.value); setSaved(false); }} style={{ flex: 1 }} />
      <button className="btn sm" disabled={pending || !dirty} onClick={save}>{saved && !dirty ? <><Check size={13} /> Saved</> : "Save"}</button>
    </div>
  );
}
