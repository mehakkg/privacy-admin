"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, History, ExternalLink, X, AlertTriangle, Globe, Clock, Trash2 } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import {
  setSubjectTypeAction, requestPurposeProcessorAction, proposeNewPurposeAction,
  setLifecycleStateAction, requestArchiveAction, setEntityAction, assignFieldToActivityAction,
  createActivityWithElementsAction, addElementWithPurposeAction,
  type NewElementInput,
} from "@/app/actions/dataMap";
import {
  lawfulBasisLabel,
  jurisdictionLabel, isCrossBorderUnreviewed,
  LIFECYCLE_LABEL, type LifecycleState, rollup,
} from "@/lib/processingActivity";
import { PurposeSelector, purposeChoiceValid, type PurposeChoice } from "@/components/access/purposeSelector";
import type { ActionResult } from "@/app/actions/requests";

/** Map a PurposeChoice from the selector to the server's NewElementInput shape. */
function choiceToInput(name: string, choice: PurposeChoice): NewElementInput {
  if (choice.mode === "existing") return { name, purposeMode: "existing", existingPurposeTagId: choice.existingPurposeTagId, processorId: choice.processorId };
  if (choice.mode === "propose") return { name, purposeMode: "propose", proposed: choice.proposed };
  return { name, purposeMode: "none" };
}

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
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [addElementFor, setAddElementFor] = useState<{ id: string; name: string } | null>(null);
  const [requestFor, setRequestFor] = useState<ElementRow | null>(null);
  const [inventoryFor, setInventoryFor] = useState<ElementRow | null>(null);
  const [historyFor, setHistoryFor] = useState<ElementRow | null>(null);
  // Opened when arriving from Data Inventory with ?assign=<fieldPath>.
  const [assigning, setAssigning] = useState<string | null>(assignField);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{activities.length} activit{activities.length === 1 ? "y" : "ies"} · Purpose, Retention &amp; Lawful basis are DPO-owned and set via an approved request; Admin owns Subject type, Lifecycle and Entity.</span>
        <button className="btn primary sm" onClick={() => setAddActivityOpen(true)}><Plus size={14} /> Add activity</button>
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
                onAddElement={() => setAddElementFor({ id: a.id, name: a.activity })}
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

      {addActivityOpen && (
        <AddActivityModal
          purposes={purposes}
          processors={processors}
          entities={entities}
          pending={pending}
          onClose={() => setAddActivityOpen(false)}
          onSubmit={(input, done) => run(() => createActivityWithElementsAction(input), () => { setAddActivityOpen(false); done(); })}
        />
      )}
      {addElementFor && (
        <AddElementModal
          activity={addElementFor}
          purposes={purposes}
          processors={processors}
          pending={pending}
          onClose={() => setAddElementFor(null)}
          onSubmit={(el, done) => run(() => addElementWithPurposeAction(addElementFor.id, el), () => { setAddElementFor(null); done(); })}
        />
      )}
      {requestFor && (
        <RequestModal
          element={requestFor}
          purposes={purposes}
          processors={processors}
          onClose={() => setRequestFor(null)}
          onExisting={(req, done) => run(() => requestPurposeProcessorAction(requestFor.id, req), () => { setRequestFor(null); done(); })}
          onPropose={(p, done) => run(() => proposeNewPurposeAction(requestFor.id, p), () => { setRequestFor(null); done(); })}
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
  a, entities, onRequest, onInventory, onHistory, onSubjectType, onLifecycle, onArchive, onEntity, onAddElement, pending,
}: {
  a: ActivityRow; entities: Opt[];
  onRequest: (el: ElementRow) => void;
  onInventory: (el: ElementRow) => void;
  onHistory: (el: ElementRow) => void;
  onSubjectType: (elId: string, v: string) => void;
  onLifecycle: (v: string) => void;
  onArchive: () => void;
  onEntity: (v: string) => void;
  onAddElement: () => void; pending: boolean;
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
        <button className="btn ghost xs" onClick={onAddElement}><Plus size={12} /> Add element</button>
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

/**
 * Request a purpose for an element — the two-tab flow: "Use existing purpose"
 * (routes an assignment request to the DPO) or "Propose new purpose" (creates a
 * pending purpose in the same DPO Approval Queue). Admin never sets a purpose
 * directly; both paths go to the DPO.
 */
function RequestModal({
  element, purposes, processors, onClose, onExisting, onPropose, pending,
}: {
  element: ElementRow; purposes: Opt[]; processors: Opt[];
  onClose: () => void;
  onExisting: (req: { existingPurposeTagId?: string | null; processorId?: string | null }, done: () => void) => void;
  onPropose: (p: { name: string; description: string; legalBasis: string }, done: () => void) => void;
  pending: boolean;
}) {
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "existing", existingPurposeTagId: null, processorId: null });
  const valid = purposeChoiceValid(choice) && choice.mode !== "none";

  const submit = () => {
    if (choice.mode === "existing") onExisting({ existingPurposeTagId: choice.existingPurposeTagId, processorId: choice.processorId }, () => {});
    else if (choice.mode === "propose") onPropose(choice.proposed, () => {});
  };

  return (
    <Modal
      title="Request purpose"
      size="md"
      subtitle={<>For <strong>{element.elementName}</strong> — Admin can’t set a purpose directly; this goes to the DPO.</>}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={pending || !valid} onClick={submit}>{pending ? "Submitting…" : "Submit request to DPO"}</button>
        </>
      }
    >
      <PurposeSelector value={choice} onChange={setChoice} purposes={purposes} processors={processors} elementName={element.elementName} />
    </Modal>
  );
}

interface ElementDraft { name: string; choice: PurposeChoice }

function purposeSummary(choice: PurposeChoice, purposes: Opt[]): string {
  if (choice.mode === "none") return "Unassigned";
  if (choice.mode === "existing") return choice.existingPurposeTagId ? `Request: ${purposes.find((p) => p.id === choice.existingPurposeTagId)?.name ?? "purpose"}` : "Request (no purpose picked)";
  return `Propose: ${choice.proposed.name || "new purpose"}`;
}

/**
 * ADD ACTIVITY — the guided, continuous modal. Activity fields, then its first
 * element(s) with the purpose request already attached, all before the modal
 * closes. "Add another element" is optional and repeatable.
 */
function AddActivityModal({
  purposes, processors, entities, pending, onClose, onSubmit,
}: {
  purposes: Opt[]; processors: Opt[]; entities: Opt[]; pending: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; entityId?: string | null; description?: string | null; elements: NewElementInput[] }, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [description, setDescription] = useState("");
  const [elements, setElements] = useState<ElementDraft[]>([]);
  const [curName, setCurName] = useState("");
  const [curChoice, setCurChoice] = useState<PurposeChoice>({ mode: "none" });
  const [nameError, setNameError] = useState(false);

  const curValid = curName.trim() && purposeChoiceValid(curChoice);
  const commitCurrent = () => {
    if (!curValid) return;
    setElements((e) => [...e, { name: curName.trim(), choice: curChoice }]);
    setCurName("");
    setCurChoice({ mode: "none" });
  };

  const submit = () => {
    if (!name.trim()) { setNameError(true); return; }
    const all = [...elements];
    if (curName.trim() && purposeChoiceValid(curChoice)) all.push({ name: curName.trim(), choice: curChoice });
    onSubmit({ name: name.trim(), entityId: entityId || null, description: description.trim() || null, elements: all.map((d) => choiceToInput(d.name, d.choice)) }, () => {});
  };

  return (
    <Modal
      title="Add activity"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={pending || !name.trim()} onClick={submit}>{pending ? "Creating…" : "Create activity"}</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 240px" }}>
            <div className="section-label">Activity name <span className="cell-sub">(required)</span></div>
            <input className="input" placeholder="e.g. Loan Application" value={name} onChange={(e) => { setName(e.target.value); setNameError(false); }} autoFocus />
            {nameError && <span className="field-error">Name the activity.</span>}
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <div className="section-label">Entity (Fiduciary)</div>
            <select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">Unassigned entity</option>
              {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className="section-label">Description</div>
          <input className="input" placeholder="One-line description of the processing" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="std-divider" />

        <div>
          <div className="section-label">Elements</div>
          {elements.length > 0 && (
            <div className="stack" style={{ gap: 6, margin: "6px 0 10px" }}>
              {elements.map((d, i) => (
                <div key={i} className="draft-row">
                  <span className="cell-primary">{d.name}</span>
                  <span className="cell-sub">{purposeSummary(d.choice, purposes)}</span>
                  <button className="icon-btn xs" style={{ marginLeft: "auto" }} onClick={() => setElements((e) => e.filter((_, j) => j !== i))} aria-label="Remove element"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="add-element-form">
            <div className="section-label">{elements.length ? "Add another element" : "First element"} <span className="cell-sub">(optional)</span></div>
            <input className="input" placeholder="Element name, e.g. PAN Number" value={curName} onChange={(e) => setCurName(e.target.value)} style={{ marginBottom: 10 }} />
            <PurposeSelector value={curChoice} onChange={setCurChoice} purposes={purposes} processors={processors} elementName={curName.trim() || "this element"} allowNone />
            <button className="btn sm" style={{ marginTop: 10 }} disabled={!curValid} onClick={commitCurrent}><Plus size={13} /> Add another element</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** ADD ELEMENT — one element onto an existing activity, purpose request inline. */
function AddElementModal({
  activity, purposes, processors, pending, onClose, onSubmit,
}: {
  activity: { id: string; name: string }; purposes: Opt[]; processors: Opt[]; pending: boolean;
  onClose: () => void;
  onSubmit: (el: NewElementInput, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "none" });
  const [nameError, setNameError] = useState(false);
  const valid = name.trim() && purposeChoiceValid(choice);

  const submit = () => {
    if (!name.trim()) { setNameError(true); return; }
    onSubmit(choiceToInput(name.trim(), choice), () => {});
  };

  return (
    <Modal
      title="Add element"
      size="md"
      subtitle={<>Adding to: <strong>{activity.name}</strong></>}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={pending || !valid} onClick={submit}>{pending ? "Adding…" : "Add element"}</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <div className="section-label">Element name <span className="cell-sub">(required)</span></div>
          <input className="input" placeholder="e.g. Phone Number" value={name} onChange={(e) => { setName(e.target.value); setNameError(false); }} autoFocus />
          {nameError && <span className="field-error">Name the element.</span>}
        </div>
        <div>
          <div className="section-label">Purpose</div>
          <PurposeSelector value={choice} onChange={setChoice} purposes={purposes} processors={processors} elementName={name.trim() || "this element"} allowNone />
        </div>
      </div>
    </Modal>
  );
}
