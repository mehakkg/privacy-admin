"use client";

import { useEffect, useState } from "react";
import { USERS, DEPARTMENTS, PRINCIPAL_OPTIONS } from "@/lib/activities/org";
import type { BasicsPatch, SaveResult } from "@/app/actions/activities";
import type { Principal } from "@/lib/activities/types";
import type { WorkspaceView } from "@/lib/engines/activities";

interface Conflict { mine: unknown; theirs: unknown; by: string; at: string }

/** SCREEN 4 — Basics. Who owns this activity, and whose data does it cover?
 *  Autosaves through the shell's save(); a true conflict (another session wrote the
 *  same field) shows inline at that field with "Keep mine / Use theirs" — never a
 *  page reload (M1 / D4). */
export function BasicsPane({ view, save, readOnly, onConflictCount }: { view: WorkspaceView; save: (patch: BasicsPatch) => Promise<SaveResult>; readOnly: boolean; onConflictCount?: (n: number) => void }) {
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description);
  const [owner, setOwner] = useState(view.ownerName ?? "");
  const [department, setDepartment] = useState(view.department ?? "");
  const [entityId, setEntityId] = useState(view.entityId ?? "");
  const [principals, setPrincipals] = useState<Principal[]>(view.principals as Principal[]);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, Conflict>>({});

  useEffect(() => { onConflictCount?.(Object.keys(conflicts).length); }, [conflicts, onConflictCount]);

  /** Save a patch and fold any conflict back onto the touched field(s). */
  const persist = async (patch: BasicsPatch) => {
    const r = await save(patch);
    if (r.conflictFields && r.conflictFields.length) {
      setConflicts((c) => {
        const next = { ...c };
        for (const f of r.conflictFields!) next[f] = { mine: (patch as Record<string, unknown>)[f], theirs: r.theirs?.[f], by: r.by ?? "Someone", at: r.at ?? new Date().toISOString() };
        return next;
      });
    } else if (r.ok) {
      setConflicts((c) => { const next = { ...c }; for (const f of Object.keys(patch)) delete next[f]; return next; });
    }
  };

  const applyTheirs = (field: string, value: unknown) => {
    if (field === "name") setName((value as string) ?? "");
    else if (field === "description") setDescription((value as string) ?? "");
    else if (field === "ownerName") setOwner((value as string) ?? "");
    else if (field === "department") setDepartment((value as string) ?? "");
    else if (field === "entityId") setEntityId((value as string) ?? "");
    else if (field === "principals") setPrincipals((value as Principal[]) ?? []);
  };
  const keepMine = (field: string) => { void persist({ [field]: conflicts[field].mine } as BasicsPatch); };
  const useTheirs = (field: string) => { applyTheirs(field, conflicts[field].theirs); setConflicts((c) => { const n = { ...c }; delete n[field]; return n; }); };

  const labelValue = (field: string, v: unknown): string => {
    if (field === "principals") { const ids = (v as string[]) ?? []; return ids.length ? ids.map((id) => PRINCIPAL_OPTIONS.find((p) => p.id === id)?.label ?? id).join(", ") : "None"; }
    if (field === "entityId") return (v ? view.entities.find((e) => e.id === v)?.name : null) ?? "None";
    const s = v == null || v === "" ? "None" : String(v);
    return s;
  };
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const ConflictBox = ({ field }: { field: string }) => {
    const c = conflicts[field];
    if (!c) return null;
    return (
      <div className="pa-conflict" style={{ marginTop: 8, border: "1px solid var(--yellow-300, #fcd34d)", background: "var(--yellow-50, #fffbeb)", borderRadius: 8, padding: "10px 12px" }}>
        <div className="cell-sub" style={{ fontWeight: 600 }}>{c.by} changed this at {fmtTime(c.at)}.</div>
        <div className="stack" style={{ gap: 2, margin: "6px 0 8px" }}>
          <div className="cell-sub">Theirs: <strong>{labelValue(field, c.theirs)}</strong></div>
          <div className="cell-sub">Yours: <strong>{labelValue(field, c.mine)}</strong></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => keepMine(field)}>Keep mine</button>
          <button className="btn sm" onClick={() => useTheirs(field)}>Use theirs</button>
        </div>
      </div>
    );
  };

  const togglePrincipal = (p: Principal) => {
    const next = principals.includes(p) ? principals.filter((x) => x !== p) : [...principals, p];
    setPrincipals(next); void persist({ principals: next });
  };

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
      <h2 style={{ margin: 0 }}>Basics</h2>

      <label className="fld"><span>Name</span>
        <input className="input" value={name} disabled={readOnly} maxLength={80} onChange={(e) => { setName(e.target.value); setNameErr(null); }}
          onBlur={() => { if (name.trim().length < 3) { setNameErr("Use a name of 3 to 80 characters."); return; } if (name !== view.name) void persist({ name }); }} />
        {nameErr && <span className="fld-err">{nameErr}</span>}
        <ConflictBox field="name" />
      </label>

      <label className="fld"><span>Description</span>
        <textarea className="input" rows={2} value={description} disabled={readOnly} maxLength={300} placeholder="One or two sentences on what this activity does."
          onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (description !== view.description) void persist({ description }); }} />
        <ConflictBox field="description" />
      </label>

      <label className="fld"><span>Owner</span>
        <select className="input" value={owner} disabled={readOnly} onChange={(e) => { setOwner(e.target.value); void persist({ ownerName: e.target.value || null }); }}>
          <option value="">Choose an owner…</option>
          {USERS.map((u) => <option key={u.id} value={u.name}>{u.name} — {u.department}</option>)}
        </select>
        {!owner && <span className="fld-help">Required.</span>}
        <ConflictBox field="ownerName" />
      </label>

      <label className="fld"><span>Department</span>
        <select className="input" value={department} disabled={readOnly} onChange={(e) => { setDepartment(e.target.value); void persist({ department: e.target.value || null }); }}>
          <option value="">—</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <ConflictBox field="department" />
      </label>

      {view.multiEntity && (
        <label className="fld"><span>Entity</span>
          <select className="input" value={entityId} disabled={readOnly} onChange={(e) => { setEntityId(e.target.value); void persist({ entityId: e.target.value || null }); }}>
            <option value="">Choose an entity…</option>{view.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          <span className="fld-help">The legal entity responsible for this activity.</span>
          <ConflictBox field="entityId" />
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
        <ConflictBox field="principals" />
      </div>
    </div>
  );
}
