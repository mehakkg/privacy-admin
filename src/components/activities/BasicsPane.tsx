"use client";

import { useState } from "react";
import { USERS, DEPARTMENTS, PRINCIPAL_OPTIONS } from "@/lib/activities/org";
import type { BasicsPatch } from "@/app/actions/activities";
import type { Principal } from "@/lib/activities/types";
import type { WorkspaceView } from "@/lib/engines/activities";

/** SCREEN 4 — Basics. Who owns this activity, and whose data does it cover?
 *  Autosaves through the shell's save(); errors show after blur on a required field. */
export function BasicsPane({ view, save, readOnly }: { view: WorkspaceView; save: (patch: BasicsPatch) => void; readOnly: boolean }) {
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description);
  const [owner, setOwner] = useState(view.ownerName ?? "");
  const [department, setDepartment] = useState(view.department ?? "");
  const [entityId, setEntityId] = useState(view.entityId ?? "");
  const [principals, setPrincipals] = useState<Principal[]>(view.principals as Principal[]);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const togglePrincipal = (p: Principal) => {
    const next = principals.includes(p) ? principals.filter((x) => x !== p) : [...principals, p];
    setPrincipals(next); save({ principals: next });
  };

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
      <h2 style={{ margin: 0 }}>Basics</h2>

      <label className="fld"><span>Name</span>
        <input className="input" value={name} disabled={readOnly} maxLength={80} onChange={(e) => { setName(e.target.value); setNameErr(null); }}
          onBlur={() => { if (name.trim().length < 3) { setNameErr("Use a name of 3 to 80 characters."); return; } if (name !== view.name) save({ name }); }} />
        {nameErr && <span className="fld-err">{nameErr}</span>}
      </label>

      <label className="fld"><span>Description</span>
        <textarea className="input" rows={2} value={description} disabled={readOnly} maxLength={300} placeholder="One or two sentences on what this activity does."
          onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (description !== view.description) save({ description }); }} />
      </label>

      <label className="fld"><span>Owner</span>
        <select className="input" value={owner} disabled={readOnly} onChange={(e) => { setOwner(e.target.value); save({ ownerName: e.target.value || null }); }}>
          <option value="">Choose an owner…</option>
          {USERS.map((u) => <option key={u.id} value={u.name}>{u.name} — {u.department}</option>)}
        </select>
        {!owner && <span className="fld-help">Required.</span>}
      </label>

      <label className="fld"><span>Department</span>
        <select className="input" value={department} disabled={readOnly} onChange={(e) => { setDepartment(e.target.value); save({ department: e.target.value || null }); }}>
          <option value="">—</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>

      {view.multiEntity && (
        <label className="fld"><span>Entity</span>
          <select className="input" value={entityId} disabled={readOnly} onChange={(e) => { setEntityId(e.target.value); save({ entityId: e.target.value || null }); }}>
            <option value="">Choose an entity…</option>{view.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          <span className="fld-help">The legal entity responsible for this activity.</span>
        </label>
      )}

      <div className="fld">
        <span>Whose data</span>
        <div className="stack" style={{ gap: 6, marginTop: 4 }}>
          {PRINCIPAL_OPTIONS.map((p) => (
            <label key={p.id} className="row" style={{ gap: 8, alignItems: "center", cursor: readOnly ? "default" : "pointer" }}>
              <input type="checkbox" checked={principals.includes(p.id)} disabled={readOnly} onChange={() => togglePrincipal(p.id)} /> {p.label}
            </label>
          ))}
        </div>
        {principals.includes("children") && (
          <div className="notice warn" style={{ marginTop: 8 }}>Children&rsquo;s data needs verifiable parental consent under DPDP Section 9. Your DPO will see this activity flagged.</div>
        )}
        {principals.length === 0 && <span className="fld-help">Choose at least one.</span>}
      </div>
    </div>
  );
}
