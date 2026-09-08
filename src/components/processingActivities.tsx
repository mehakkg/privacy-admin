"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  addActivityAction, addElementAction, setSubjectTypeAction, requestPurposeProcessorAction,
} from "@/app/actions/dataMap";
import type { ActionResult } from "@/app/actions/requests";

export interface ElementRow {
  id: string;
  elementName: string;
  purposeTagId: string | null;
  purposeName: string | null;
  processorId: string | null;
  processorName: string | null;
  subjectType: string | null;
  requestState: string;
}
export interface ActivityRow {
  id: string;
  activity: string;
  elements: ElementRow[];
}
interface Opt { id: string; name: string }

const SUBJECT_TYPES = ["customer", "employee", "vendor", "minor"];

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) { after?.(); router.refresh(); }
    });
  return { pending, result, run };
}

/**
 * PROCESSING ACTIVITIES — the nested element-level table. Purpose and Processor
 * attach per PII element, never per activity, so the Activity cell is merged
 * across its elements (the grouped-row pattern used for every nested table in
 * this product). Purpose is policy-locked; an unassigned element routes a
 * bundled Purpose+Processor request to the DPO — Admin never creates a Purpose
 * directly.
 */
export function ProcessingActivitiesTable({
  activities, purposes, processors,
}: {
  activities: ActivityRow[];
  purposes: Opt[];
  processors: Opt[];
}) {
  const { pending, result, run } = useRun();
  const [addingActivity, setAddingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState("");
  const [addElementFor, setAddElementFor] = useState<string | null>(null);
  const [newElement, setNewElement] = useState("");
  const [requestFor, setRequestFor] = useState<ElementRow | null>(null);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{activities.length} activit{activities.length === 1 ? "y" : "ies"} · Purpose &amp; Processor are set per element, via a DPO-approved request.</span>
        {!addingActivity ? (
          <button className="btn primary sm" onClick={() => setAddingActivity(true)}><Plus size={14} /> Add activity</button>
        ) : (
          <span className="row" style={{ gap: 6 }}>
            <input className="input sm" placeholder="New activity name" value={newActivity} onChange={(e) => setNewActivity(e.target.value)} autoFocus style={{ width: 220 }} />
            <button className="btn primary sm" disabled={pending || !newActivity.trim()} onClick={() => run(() => addActivityAction(newActivity), () => { setNewActivity(""); setAddingActivity(false); })}>Create</button>
            <button className="btn ghost sm" onClick={() => { setAddingActivity(false); setNewActivity(""); }}>Cancel</button>
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Element</th>
              <th>Purpose</th>
              <th>Processor</th>
              <th>Subject type</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const span = Math.max(1, a.elements.length) + 1; // +1 for the add-element row
              return (
                <ActivityGroup
                  key={a.id}
                  a={a}
                  span={span}
                  processors={processors}
                  onRequest={(el) => setRequestFor(el)}
                  onSubjectType={(elId, v) => run(() => setSubjectTypeAction(elId, v))}
                  addElementFor={addElementFor}
                  setAddElementFor={setAddElementFor}
                  newElement={newElement}
                  setNewElement={setNewElement}
                  onAddElement={(actId) => run(() => addElementAction(actId, newElement), () => { setNewElement(""); setAddElementFor(null); })}
                  pending={pending}
                />
              );
            })}
            {activities.length === 0 && (
              <tr><td colSpan={5}><div className="empty">No processing activities yet. Add one to begin mapping elements to purposes.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {requestFor && (
        <RequestModal
          element={requestFor}
          purposes={purposes}
          processors={processors}
          onClose={() => setRequestFor(null)}
          onSubmit={(req, done) => run(() => requestPurposeProcessorAction(requestFor.id, req), () => { setRequestFor(null); done(); })}
          pending={pending}
        />
      )}
    </div>
  );
}

function ActivityGroup({
  a, span, processors, onRequest, onSubjectType, addElementFor, setAddElementFor, newElement, setNewElement, onAddElement, pending,
}: {
  a: ActivityRow; span: number; processors: Opt[];
  onRequest: (el: ElementRow) => void;
  onSubjectType: (elId: string, v: string) => void;
  addElementFor: string | null; setAddElementFor: (v: string | null) => void;
  newElement: string; setNewElement: (v: string) => void;
  onAddElement: (activityId: string) => void; pending: boolean;
}) {
  const rows: ReactNode[] = [];
  a.elements.forEach((el, i) => {
    rows.push(
      <tr key={el.id}>
        {i === 0 && <td rowSpan={span} className="group-cell"><span className="cell-primary">{a.activity}</span></td>}
        <td className="cell-primary">{el.elementName}</td>
        <td>
          {el.purposeName ? (
            <span className="lock-inline" title="Set by DPO — from the approved purpose taxonomy"><Lock size={12} /> {el.purposeName}</span>
          ) : el.requestState === "requested" ? (
            <Pill tone="blue">Requested — awaiting DPO</Pill>
          ) : (
            <button className="btn ghost xs" onClick={() => onRequest(el)}>Unassigned — Request →</button>
          )}
        </td>
        <td className="cell-sub">
          {el.purposeName
            ? (el.processorName ?? <span className="cell-sub">Internal</span>)
            : el.requestState === "requested" ? <span className="cell-sub">— (in request)</span> : <span className="muted">—</span>}
        </td>
        <td>
          <select className="input sm" value={el.subjectType ?? ""} onChange={(e) => onSubjectType(el.id, e.target.value)} style={{ width: 130 }}>
            <option value="">Unset</option>
            {SUBJECT_TYPES.map((s) => <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>)}
          </select>
        </td>
      </tr>,
    );
  });
  if (a.elements.length === 0) {
    rows.push(<tr key="empty"><td rowSpan={span} className="group-cell"><span className="cell-primary">{a.activity}</span></td><td colSpan={4} className="cell-sub">No elements yet.</td></tr>);
  }
  // Add-element row
  rows.push(
    <tr key="add" className="add-row">
      <td colSpan={4}>
        {addElementFor === a.id ? (
          <span className="row" style={{ gap: 6 }}>
            <input className="input sm" placeholder="e.g. PAN Number" value={newElement} onChange={(e) => setNewElement(e.target.value)} autoFocus style={{ width: 200 }} />
            <button className="btn primary xs" disabled={pending || !newElement.trim()} onClick={() => onAddElement(a.id)}>Add</button>
            <button className="btn ghost xs" onClick={() => setAddElementFor(null)}>Cancel</button>
          </span>
        ) : (
          <button className="btn ghost xs" onClick={() => setAddElementFor(a.id)}><Plus size={12} /> Add element</button>
        )}
      </td>
    </tr>,
  );
  return <>{rows}</>;
}

/** Bundled Purpose + Processor request. Searches approved purposes for a close
 *  match FIRST, so an existing one is picked before a new one is proposed. */
function RequestModal({
  element, purposes, processors, onClose, onSubmit, pending,
}: {
  element: ElementRow; purposes: Opt[]; processors: Opt[];
  onClose: () => void;
  onSubmit: (req: { existingPurposeTagId?: string | null; proposedPurposeName?: string | null; processorId?: string | null }, done: () => void) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [asNew, setAsNew] = useState(false);
  const [processorId, setProcessorId] = useState<string>("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purposes.slice(0, 6);
    return purposes.filter((p) => p.name.toLowerCase().includes(q) || q.split(/\s+/).some((t) => p.name.toLowerCase().includes(t))).slice(0, 6);
  }, [query, purposes]);

  const canSubmit = (picked && !asNew) || (asNew && query.trim());

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Request purpose &amp; processor</h3>
        <p className="cell-sub" style={{ marginTop: 0 }}>For <strong>{element.elementName}</strong>. Admin can&rsquo;t create a purpose directly — this bundles the purpose and processor into one request the DPO approves.</p>

        <div className="section-label">Purpose</div>
        <input className="input" placeholder="Search approved purposes, or type a new one…" value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null); setAsNew(false); }} />
        {!asNew && (
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {matches.map((p) => (
              <button key={p.id} className={`pick-item${picked === p.id ? " on" : ""}`} onClick={() => { setPicked(p.id); }}>
                <span className="cell-primary">{p.name}</span>
                <span className="cell-sub">Existing approved purpose</span>
              </button>
            ))}
            {query.trim() && (
              <button className="btn ghost xs" style={{ alignSelf: "flex-start" }} onClick={() => { setAsNew(true); setPicked(null); }}>
                None of these — propose “{query.trim()}” as new →
              </button>
            )}
          </div>
        )}
        {asNew && (
          <div style={{ marginTop: 8 }}>
            <Pill tone="yellow">New purpose proposed: “{query.trim()}”</Pill>
            <button className="btn ghost xs" style={{ marginLeft: 8 }} onClick={() => setAsNew(false)}>Back to matches</button>
          </div>
        )}

        <div className="section-label" style={{ marginTop: 14 }}>Processor</div>
        <select className="input" value={processorId} onChange={(e) => setProcessorId(e.target.value)}>
          <option value="">Internal — no processor</option>
          {processors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={pending || !canSubmit}
            onClick={() => onSubmit(
              asNew
                ? { proposedPurposeName: query.trim(), processorId: processorId || null }
                : { existingPurposeTagId: picked, processorId: processorId || null },
              () => {},
            )}
          >
            {pending ? "Submitting…" : "Submit request to DPO"}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
