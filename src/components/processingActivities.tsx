"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, History, ExternalLink, X, AlertTriangle, Globe, Clock } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  addActivityAction, addElementAction, setSubjectTypeAction, requestPurposeProcessorAction,
  setLifecycleStateAction, requestArchiveAction, setEntityAction, assignFieldToActivityAction,
} from "@/app/actions/dataMap";
import {
  lawfulBasisLabel, LAWFUL_BASIS_LABEL, type LawfulBasis,
  jurisdictionLabel, isCrossBorderUnreviewed,
  LIFECYCLE_LABEL, type LifecycleState, rollup,
} from "@/lib/processingActivity";
import type { ActionResult } from "@/app/actions/requests";

export interface HistoryItem {
  at: string;
  kind: "audit" | "requested" | "approved" | "rejected";
  title: string;
  actor: string;
  detail: string | null;
}
export interface ElementRow {
  id: string;
  elementName: string;
  purposeTagId: string | null;
  purposeName: string | null;
  retention: string | null;
  lawfulBasis: string | null;
  processorId: string | null;
  processorName: string | null;
  processorJurisdiction: string | null;
  processorHasDpa: boolean;
  processorDpaId: string | null;
  subjectType: string | null;
  requestState: string;
  inventory: { fieldPath: string; category: string | null; sensitivityTier: string; sourceName: string } | null;
  history: HistoryItem[];
}
export interface ActivityRow {
  id: string;
  activity: string;
  lifecycleState: string;
  entityId: string | null;
  entityName: string | null;
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
 * across its elements. Purpose is policy-locked and carries its retention +
 * lawful basis (DPO-owned); an unassigned element routes a bundled request to the
 * DPO. The merged Activity cell rolls up element completeness and carries the
 * lifecycle control and Fiduciary-entity tag.
 */
export function ProcessingActivitiesTable({
  activities, purposes, processors, entities, assignField = null,
}: {
  activities: ActivityRow[];
  purposes: Opt[];
  processors: Opt[];
  entities: Opt[];
  assignField?: string | null;
}) {
  const { pending, result, run } = useRun();
  const [addingActivity, setAddingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState("");
  const [addElementFor, setAddElementFor] = useState<string | null>(null);
  const [newElement, setNewElement] = useState("");
  const [requestFor, setRequestFor] = useState<ElementRow | null>(null);
  const [inventoryFor, setInventoryFor] = useState<ElementRow | null>(null);
  const [historyFor, setHistoryFor] = useState<ElementRow | null>(null);
  // Opened when arriving from Data Inventory with ?assign=<fieldPath>.
  const [assigning, setAssigning] = useState<string | null>(assignField);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{activities.length} activit{activities.length === 1 ? "y" : "ies"} · Purpose, Retention &amp; Lawful basis are DPO-owned and set via an approved request; Admin owns Subject type, Lifecycle and Entity.</span>
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
              <th>Purpose &amp; lawful basis</th>
              <th>Retention</th>
              <th>Processor</th>
              <th>Subject type</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <ActivityGroup
                key={a.id}
                a={a}
                entities={entities}
                onRequest={(el) => setRequestFor(el)}
                onInventory={(el) => setInventoryFor(el)}
                onHistory={(el) => setHistoryFor(el)}
                onSubjectType={(elId, v) => run(() => setSubjectTypeAction(elId, v))}
                onLifecycle={(v) => run(() => setLifecycleStateAction(a.id, v))}
                onArchive={() => run(() => requestArchiveAction(a.id))}
                onEntity={(v) => run(() => setEntityAction(a.id, v))}
                addElementFor={addElementFor}
                setAddElementFor={setAddElementFor}
                newElement={newElement}
                setNewElement={setNewElement}
                onAddElement={(actId) => run(() => addElementAction(actId, newElement), () => { setNewElement(""); setAddElementFor(null); })}
                pending={pending}
              />
            ))}
            {activities.length === 0 && (
              <tr><td colSpan={6}><div className="empty">No processing activities yet. Add one to begin mapping elements to purposes.</div></td></tr>
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
      {inventoryFor && <InventoryDrawer element={inventoryFor} onClose={() => setInventoryFor(null)} />}
      {historyFor && <HistoryDrawer element={historyFor} onClose={() => setHistoryFor(null)} />}
      {assigning && (
        <AssignModal
          fieldName={assigning}
          activities={activities}
          pending={pending}
          onClose={() => setAssigning(null)}
          onSubmit={(target) => run(() => assignFieldToActivityAction(assigning, target), () => setAssigning(null))}
        />
      )}
    </div>
  );
}

/** Land an unassigned inventory field onto an activity (existing or new). Arrived
 *  at from Data Inventory's untagged-field link — item 10, closing the loop. */
function AssignModal({
  fieldName, activities, pending, onClose, onSubmit,
}: {
  fieldName: string; activities: ActivityRow[]; pending: boolean;
  onClose: () => void;
  onSubmit: (target: { activityId?: string | null; newActivityName?: string | null }) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(activities.length ? "existing" : "new");
  const [activityId, setActivityId] = useState<string>(activities[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const canSubmit = mode === "existing" ? Boolean(activityId) : Boolean(newName.trim());

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Assign field to an activity</h3>
        <p className="cell-sub" style={{ marginTop: 0 }}>
          <span className="mono">{fieldName}</span> has no purpose recorded. Add it as an element on a Processing Activity — Purpose &amp; Processor are then requested from the DPO as usual.
        </p>

        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <button className={`btn sm${mode === "existing" ? " primary" : " ghost"}`} disabled={!activities.length} onClick={() => setMode("existing")}>Existing activity</button>
          <button className={`btn sm${mode === "new" ? " primary" : " ghost"}`} onClick={() => setMode("new")}>New activity</button>
        </div>

        {mode === "existing" ? (
          <select className="input" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.activity}</option>)}
          </select>
        ) : (
          <input className="input" placeholder="New activity name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
        )}

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={pending || !canSubmit}
            onClick={() => onSubmit(mode === "existing" ? { activityId } : { newActivityName: newName.trim() })}
          >
            {pending ? "Assigning…" : "Assign field"}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ActivityGroup({
  a, entities, onRequest, onInventory, onHistory, onSubjectType, onLifecycle, onArchive, onEntity,
  addElementFor, setAddElementFor, newElement, setNewElement, onAddElement, pending,
}: {
  a: ActivityRow; entities: Opt[];
  onRequest: (el: ElementRow) => void;
  onInventory: (el: ElementRow) => void;
  onHistory: (el: ElementRow) => void;
  onSubjectType: (elId: string, v: string) => void;
  onLifecycle: (v: string) => void;
  onArchive: () => void;
  onEntity: (v: string) => void;
  addElementFor: string | null; setAddElementFor: (v: string | null) => void;
  newElement: string; setNewElement: (v: string) => void;
  onAddElement: (activityId: string) => void; pending: boolean;
}) {
  const span = Math.max(1, a.elements.length) + 1; // +1 for the add-element row
  const roll = rollup(a.elements.map((e) => ({ purposeAssigned: e.purposeTagId != null, hasRetention: e.retention != null })));
  const hasRequested = a.elements.some((e) => e.requestState === "requested");
  const archived = a.lifecycleState === "archived";

  const activityCell = (
    <td rowSpan={span} className="group-cell" style={{ verticalAlign: "top" }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="cell-primary">{a.activity}</span>
        <Pill tone={roll.tone}>{roll.label}</Pill>

        <div className="stack" style={{ gap: 3 }}>
          <span className="field-label">Lifecycle</span>
          <select
            className="input xs"
            value={a.lifecycleState}
            disabled={pending || archived}
            onChange={(e) => onLifecycle(e.target.value)}
            style={{ width: 148 }}
            title={archived ? "Archived — a DPO ruling is required to reopen" : undefined}
          >
            {(["active", "under_review"] as LifecycleState[]).map((s) => (
              <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>
            ))}
            {archived && <option value="archived">{LIFECYCLE_LABEL.archived}</option>}
          </select>
          {!archived && (
            <span title={hasRequested ? "An element is still awaiting a DPO ruling — resolve it before requesting archive." : "Archiving needs DPO approval"}>
              <button className="btn ghost xs" disabled={pending || hasRequested} onClick={onArchive} style={{ alignSelf: "flex-start" }}>
                Request archive →
              </button>
            </span>
          )}
          {a.lifecycleState === "under_review" && <Pill tone="yellow">Under review</Pill>}
        </div>

        <div className="stack" style={{ gap: 3 }}>
          <span className="field-label">Entity</span>
          <select className="input xs" value={a.entityId ?? ""} disabled={pending} onChange={(e) => onEntity(e.target.value)} style={{ width: 148 }}>
            <option value="">Unassigned entity</option>
            {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
        </div>
      </div>
    </td>
  );

  const rows: ReactNode[] = [];
  a.elements.forEach((el, i) => {
    rows.push(
      <tr key={el.id}>
        {i === 0 && activityCell}
        <td>
          <span className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className="linklike cell-primary" onClick={() => onInventory(el)} title="View this field's Data Inventory record">{el.elementName}</button>
            <button className="icon-btn xs" onClick={() => onHistory(el)} title="View history" aria-label="View history"><History size={13} /></button>
          </span>
        </td>
        <td>
          {el.purposeName ? (
            <span className="stack" style={{ gap: 3 }}>
              <span className="lock-inline" title="Set by DPO — from the approved purpose taxonomy"><Lock size={12} /> {el.purposeName}</span>
              {el.lawfulBasis && <Chip>{lawfulBasisLabel(el.lawfulBasis)}</Chip>}
            </span>
          ) : el.requestState === "requested" ? (
            <Pill tone="blue">Requested — awaiting DPO</Pill>
          ) : (
            <button className="btn ghost xs" onClick={() => onRequest(el)}>Unassigned — Request →</button>
          )}
        </td>
        <td>
          {el.purposeName
            ? (el.retention
                ? <span className="lock-inline" title="Retention is set by the DPO on the purpose"><Lock size={12} /> {el.retention}</span>
                : <Pill tone="yellow">Retention not set</Pill>)
            : el.requestState === "requested" ? <span className="cell-sub">— (in request)</span> : <span className="muted">—</span>}
        </td>
        <td>
          <ProcessorCell el={el} />
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
    rows.push(<tr key="empty">{activityCell}<td colSpan={5} className="cell-sub">No elements yet.</td></tr>);
  }
  rows.push(
    <tr key="add" className="add-row">
      <td colSpan={5}>
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

/** Processor cell — Internal, or an external processor with its jurisdiction and
 *  DPA state. An external processor with no valid DPA is called out, not blanked;
 *  a cross-border, off-allowlist jurisdiction is flagged for review. */
function ProcessorCell({ el }: { el: ElementRow }) {
  if (!el.purposeName) {
    return el.requestState === "requested" ? <span className="cell-sub">— (in request)</span> : <span className="muted">—</span>;
  }
  if (!el.processorId) return <span className="cell-sub">Internal</span>;
  const crossBorder = isCrossBorderUnreviewed(el.processorJurisdiction);
  return (
    <span className="stack" style={{ gap: 4 }}>
      <span className="row" style={{ gap: 5, alignItems: "center" }}>
        {el.processorHasDpa ? (
          <Link href="/vendor-risk/register" className="row-link" title="Open the Vendor Risk (TPRM) record">
            {el.processorName} <ExternalLink size={11} />
          </Link>
        ) : (
          <span className="cell-primary">{el.processorName}</span>
        )}
      </span>
      {!el.processorHasDpa && (
        <span className="warn-chip" title="No active DPA / TPRM record on file for this processor"><AlertTriangle size={11} /> No DPA on file</span>
      )}
      {el.processorJurisdiction && (
        crossBorder
          ? <span className="warn-chip" title={`Processes in ${jurisdictionLabel(el.processorJurisdiction)} — outside India and not on the notified-country allowlist`}><Globe size={11} /> Cross-border — unreviewed</span>
          : <span className="cell-sub"><Globe size={11} style={{ verticalAlign: "-1px" }} /> {jurisdictionLabel(el.processorJurisdiction)}</span>
      )}
    </span>
  );
}

/** Element name → its Data Inventory record, inline (no navigation away). */
function InventoryDrawer({ element, onClose }: { element: ElementRow; onClose: () => void }) {
  const inv = element.inventory;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(460px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <strong>{element.elementName}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <h3 className="drawer-section first">Data Inventory record</h3>
          {inv ? (
            <>
              <dl className="kv">
                <div style={{ display: "contents" }}><dt>Field</dt><dd className="mono">{inv.fieldPath}</dd></div>
                <div style={{ display: "contents" }}><dt>Source</dt><dd>{inv.sourceName}</dd></div>
                <div style={{ display: "contents" }}><dt>Category</dt><dd>{inv.category ? <Chip>{inv.category}</Chip> : <span className="muted">—</span>}</dd></div>
                <div style={{ display: "contents" }}><dt>Sensitivity</dt><dd><Pill tone={inv.sensitivityTier === "high" ? "red" : inv.sensitivityTier === "low" ? "gray" : "yellow"}>{inv.sensitivityTier}</Pill></dd></div>
              </dl>
              <Link href="/discovery/inventory" className="row-link" style={{ fontSize: 12.5, display: "inline-block", marginTop: 12 }}>Open in Data Inventory →</Link>
            </>
          ) : (
            <p className="cell-sub" style={{ marginTop: 0 }}>
              No matching Data Inventory record was found for this element. It may be entered manually rather than discovered by a scan.{" "}
              <Link href="/discovery/inventory" className="row-link">Search the inventory →</Link>
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Read-only, system-generated element timeline. Never editable, in any role. */
function HistoryDrawer({ element, onClose }: { element: ElementRow; onClose: () => void }) {
  const items = element.history;
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const tone: Record<HistoryItem["kind"], string> = { audit: "var(--text-3)", requested: "var(--blue)", approved: "var(--green)", rejected: "var(--red)" };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(480px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <span className="row" style={{ gap: 8 }}><History size={15} /> <strong>History — {element.elementName}</strong></span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>System-generated and read-only — who requested, who approved, and when. Consistent with the audit log; not editable by anyone, including the DPO.</p>
          {items.length === 0 ? (
            <div className="empty"><p style={{ margin: 0 }}>No recorded changes yet.</p></div>
          ) : (
            <ol className="timeline">
              {items.map((it, i) => (
                <li key={i} className="timeline-item">
                  <span className="timeline-dot" style={{ background: tone[it.kind] }} />
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="cell-primary">{it.title}</span>
                    <span className="cell-sub"><Clock size={11} style={{ verticalAlign: "-1px" }} /> {fmt(it.at)} · {it.actor}</span>
                    {it.detail && <span className="cell-sub">{it.detail}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Bundled Purpose + Processor request, with an optional retention / lawful-basis
 *  suggestion for the DPO. Searches approved purposes for a close match FIRST. */
function RequestModal({
  element, purposes, processors, onClose, onSubmit, pending,
}: {
  element: ElementRow; purposes: Opt[]; processors: Opt[];
  onClose: () => void;
  onSubmit: (req: { existingPurposeTagId?: string | null; proposedPurposeName?: string | null; processorId?: string | null; proposedRetention?: string | null; proposedLawfulBasis?: string | null }, done: () => void) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [asNew, setAsNew] = useState(false);
  const [processorId, setProcessorId] = useState<string>("");
  const [retention, setRetention] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("");

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
        <p className="cell-sub" style={{ marginTop: 0 }}>For <strong>{element.elementName}</strong>. Admin can&rsquo;t set purpose, retention or lawful basis directly — this bundles them into one request the DPO approves and locks.</p>

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

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="section-label">Suggested retention <span className="cell-sub">(DPO decides)</span></div>
            <input className="input" placeholder="e.g. 365 days" value={retention} onChange={(e) => setRetention(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="section-label">Suggested lawful basis</div>
            <select className="input" value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)}>
              <option value="">—</option>
              {(Object.keys(LAWFUL_BASIS_LABEL) as LawfulBasis[]).map((k) => <option key={k} value={k}>{LAWFUL_BASIS_LABEL[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={pending || !canSubmit}
            onClick={() => onSubmit(
              {
                ...(asNew ? { proposedPurposeName: query.trim() } : { existingPurposeTagId: picked }),
                processorId: processorId || null,
                proposedRetention: retention.trim() || null,
                proposedLawfulBasis: lawfulBasis || null,
              },
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
