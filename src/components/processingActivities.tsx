"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, ExternalLink, X, AlertTriangle, Globe, Trash2, ChevronRight } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import {
  setLifecycleStateAction, requestArchiveAction, setEntityAction, assignFieldToActivityAction,
  createActivityWithPurposesAction, addPurposeSegmentAction, addElementToPurposeAction,
  removePurposeElementAction, removePurposeSegmentAction,
  type NewSegmentInput,
} from "@/app/actions/dataMap";
import {
  lawfulBasisLabel, jurisdictionLabel, isCrossBorderUnreviewed,
  LIFECYCLE_LABEL, type LifecycleState,
} from "@/lib/processingActivity";
import { PurposeSelector, purposeChoiceValid, type PurposeChoice, type Opt } from "@/components/access/purposeSelector";
import type { ActionResult } from "@/app/actions/requests";

export interface InvInfo { fieldPath: string; category: string | null; sensitivityTier: string; sourceName: string }
export interface SegElement { id: string; fieldName: string; inventory: InvInfo | null }
export interface PurposeSegment {
  id: string;
  purposeName: string | null;
  purposeStatus: string | null; // approved | pending_dpo_approval | rejected | null
  legalBasis: string | null;
  retention: string | null;
  processorName: string | null;
  processorJurisdiction: string | null;
  processorHasDpa: boolean;
  requestState: string; // none | requested
  elements: SegElement[];
}
export interface LegacyElement { id: string; elementName: string; purposeName: string | null }
export interface ActivityRow {
  id: string;
  activity: string;
  lifecycleState: string;
  entityId: string | null;
  entityName: string | null;
  segments: PurposeSegment[];
  legacyElements: LegacyElement[];
}
export interface InventoryField { id: string; path: string }

/** A segment's completeness for the rollup: an approved purpose with a retention,
 *  not awaiting the DPO. */
function segmentComplete(s: PurposeSegment): boolean {
  return s.purposeStatus === "approved" && Boolean(s.retention) && s.requestState === "none";
}
function activityRollup(a: ActivityRow): { label: string; tone: "green" | "yellow" | "gray" } {
  const hasLegacy = a.legacyElements.length > 0;
  const total = a.segments.length + (hasLegacy ? 1 : 0);
  const done = a.segments.filter(segmentComplete).length; // legacy never counts as done
  if (total === 0) return { label: "No purposes", tone: "gray" };
  if (done === total) return { label: "Fully assigned", tone: "green" };
  if (done === 0) return { label: "Unassigned", tone: "gray" };
  return { label: `Partially assigned (${done}/${total})`, tone: "yellow" };
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

function choiceToSegment(choice: PurposeChoice, elements: { name: string; classifiedFieldId?: string | null }[]): NewSegmentInput {
  if (choice.mode === "existing") return { purposeMode: "existing", existingPurposeTagId: choice.existingPurposeTagId, processorId: choice.processorId, elements };
  if (choice.mode === "propose") return { purposeMode: "propose", proposed: choice.proposed, processorId: choice.processorId, elements };
  return { purposeMode: "none", elements };
}

/**
 * PROCESSING ACTIVITIES — purpose-first. Activity → Purpose segment(s) → Elements
 * scoped to that purpose. Retention + legal basis are DPO-owned on the purpose;
 * the Processor lives on the purpose too (not the element). The same field linked
 * under two purposes shows as two rows. Legacy (element-first) data surfaces under
 * an "Unassigned" grouping for deliberate re-assignment.
 */
export function ProcessingActivitiesTable({
  activities, purposes, processors, entities, inventoryFields, assignField = null,
}: {
  activities: ActivityRow[];
  purposes: Opt[];
  processors: Opt[];
  entities: Opt[];
  inventoryFields: InventoryField[];
  assignField?: string | null;
}) {
  const { pending, result, run } = useRun();
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [addPurposeFor, setAddPurposeFor] = useState<{ id: string; name: string } | null>(null);
  const [addElementFor, setAddElementFor] = useState<{ segId: string; purposeName: string | null } | null>(null);
  const [inventoryFor, setInventoryFor] = useState<SegElement | null>(null);
  const [assigning, setAssigning] = useState<string | null>(assignField);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{activities.length} activit{activities.length === 1 ? "y" : "ies"} · Declare the <strong>purpose</strong> first; fields are added under it. Retention, legal basis &amp; processor belong to the purpose and are DPO-approved.</span>
        <button className="btn primary sm" onClick={() => setAddActivityOpen(true)}><Plus size={14} /> Add activity</button>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        {activities.map((a) => (
          <ActivityBlock
            key={a.id}
            a={a}
            entities={entities}
            pending={pending}
            onLifecycle={(v) => run(() => setLifecycleStateAction(a.id, v))}
            onArchive={() => run(() => requestArchiveAction(a.id))}
            onEntity={(v) => run(() => setEntityAction(a.id, v))}
            onAddPurpose={() => setAddPurposeFor({ id: a.id, name: a.activity })}
            onAddElement={(segId, purposeName) => setAddElementFor({ segId, purposeName })}
            onRemoveElement={(linkId) => run(() => removePurposeElementAction(linkId))}
            onRemoveSegment={(segId) => run(() => removePurposeSegmentAction(segId))}
            onInventory={(el) => setInventoryFor(el)}
          />
        ))}
        {activities.length === 0 && (
          <div className="empty" style={{ padding: 32 }}>No processing activities yet. Add one — you&rsquo;ll declare its purpose first, then the fields under it.</div>
        )}
      </div>
      <ActionError result={result} />

      {addActivityOpen && (
        <AddActivityModal
          purposes={purposes} processors={processors} entities={entities} inventoryFields={inventoryFields} pending={pending}
          onClose={() => setAddActivityOpen(false)}
          onSubmit={(input, done) => run(() => createActivityWithPurposesAction(input), () => { setAddActivityOpen(false); done(); })}
        />
      )}
      {addPurposeFor && (
        <AddPurposeModal
          activity={addPurposeFor} purposes={purposes} processors={processors} inventoryFields={inventoryFields} pending={pending}
          onClose={() => setAddPurposeFor(null)}
          onSubmit={(seg, done) => run(() => addPurposeSegmentAction(addPurposeFor.id, seg), () => { setAddPurposeFor(null); done(); })}
        />
      )}
      {addElementFor && (
        <AddElementModal
          purposeName={addElementFor.purposeName} inventoryFields={inventoryFields} pending={pending}
          onClose={() => setAddElementFor(null)}
          onSubmit={(el, done) => run(() => addElementToPurposeAction(addElementFor.segId, el), () => { setAddElementFor(null); done(); })}
        />
      )}
      {inventoryFor && <InventoryDrawer element={inventoryFor} onClose={() => setInventoryFor(null)} />}
      {assigning && (
        <AssignModal
          fieldName={assigning} activities={activities} pending={pending}
          onClose={() => setAssigning(null)}
          onSubmit={(target) => run(() => assignFieldToActivityAction(assigning, target), () => setAssigning(null))}
        />
      )}
    </div>
  );
}

function ActivityBlock({
  a, entities, pending, onLifecycle, onArchive, onEntity, onAddPurpose, onAddElement, onRemoveElement, onRemoveSegment, onInventory,
}: {
  a: ActivityRow; entities: Opt[]; pending: boolean;
  onLifecycle: (v: string) => void; onArchive: () => void; onEntity: (v: string) => void;
  onAddPurpose: () => void;
  onAddElement: (segId: string, purposeName: string | null) => void;
  onRemoveElement: (linkId: string) => void;
  onRemoveSegment: (segId: string) => void;
  onInventory: (el: SegElement) => void;
}) {
  const roll = activityRollup(a);
  const archived = a.lifecycleState === "archived";
  const hasRequested = a.segments.some((s) => s.requestState === "requested");

  return (
    <div className="pa-activity">
      <div className="pa-activity-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14 }}>{a.activity}</strong>
            <Pill tone={roll.tone}>{roll.label}</Pill>
            {a.lifecycleState === "under_review" && <Pill tone="yellow">Under review</Pill>}
          </span>
          <span className="cell-sub">{a.entityName ?? "Unassigned entity"}</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input xs" value={archived ? "archived" : a.lifecycleState} disabled={pending || archived} onChange={(e) => onLifecycle(e.target.value)} style={{ width: 130 }} title={archived ? "Archived — a DPO ruling is required to reopen" : undefined}>
            {(["active", "under_review"] as LifecycleState[]).map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>)}
            {archived && <option value="archived">{LIFECYCLE_LABEL.archived}</option>}
          </select>
          <select className="input xs" value={a.entityId ?? ""} disabled={pending} onChange={(e) => onEntity(e.target.value)} style={{ width: 150 }}>
            <option value="">Unassigned entity</option>
            {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          {!archived && (
            <span title={hasRequested ? "A purpose is still awaiting a DPO ruling — resolve it before requesting archive." : "Archiving needs DPO approval"}>
              <button className="btn ghost xs" disabled={pending || hasRequested} onClick={onArchive}>Request archive →</button>
            </span>
          )}
          <button className="btn sm" onClick={onAddPurpose}><Plus size={13} /> Add purpose</button>
        </div>
      </div>

      {a.segments.map((seg) => (
        <PurposeSegmentBlock key={seg.id} seg={seg} pending={pending} onAddElement={() => onAddElement(seg.id, seg.purposeName)} onRemoveElement={onRemoveElement} onRemoveSegment={() => onRemoveSegment(seg.id)} onInventory={onInventory} />
      ))}

      {a.legacyElements.length > 0 && (
        <div className="pa-segment legacy">
          <div className="pa-segment-head">
            <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Pill tone="yellow">Unassigned — legacy element, needs purpose</Pill>
              <span className="cell-sub">These fields predate the purpose-first structure. Re-add them under a purpose, then remove them here.</span>
            </span>
          </div>
          <div className="pa-elements">
            {a.legacyElements.map((el) => (
              <div key={el.id} className="pa-el-row">
                <span className="cell-primary">{el.elementName}</span>
                <span className="cell-sub">{el.purposeName ? `was: ${el.purposeName}` : "no purpose"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.segments.length === 0 && a.legacyElements.length === 0 && (
        <div className="pa-segment"><div className="cell-sub" style={{ padding: "6px 2px" }}>No purposes yet. Add a purpose to begin mapping fields under it.</div></div>
      )}
    </div>
  );
}

function PurposeSegmentBlock({
  seg, pending, onAddElement, onRemoveElement, onRemoveSegment, onInventory,
}: {
  seg: PurposeSegment; pending: boolean;
  onAddElement: () => void; onRemoveElement: (linkId: string) => void; onRemoveSegment: () => void; onInventory: (el: SegElement) => void;
}) {
  const deferred = !seg.purposeName;
  const crossBorder = isCrossBorderUnreviewed(seg.processorJurisdiction);
  return (
    <div className="pa-segment">
      <div className="pa-segment-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {deferred ? (
              <Pill tone="gray">Decide later — no purpose yet</Pill>
            ) : (
              <span className="lock-inline" title="Purpose is DPO-owned"><Lock size={12} /> {seg.purposeName}</span>
            )}
            {seg.legalBasis && <Chip>{lawfulBasisLabel(seg.legalBasis)}</Chip>}
            {seg.requestState === "requested" && <Pill tone="blue">Requested — awaiting DPO</Pill>}
            {seg.purposeStatus === "rejected" && <Pill tone="red">Purpose rejected</Pill>}
          </span>
          <span className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <span className="cell-sub">Retention: {seg.retention ? <span className="lock-inline"><Lock size={11} /> {seg.retention}</span> : (deferred ? "—" : <span style={{ color: "var(--yellow)" }}>not set</span>)}</span>
            <span className="cell-sub">Processor: <SegProcessor seg={seg} crossBorder={crossBorder} /></span>
          </span>
        </div>
        <button className="icon-btn xs" disabled={pending} onClick={onRemoveSegment} title="Remove this purpose segment" aria-label="Remove purpose"><Trash2 size={14} /></button>
      </div>

      <div className="pa-elements">
        {seg.elements.map((el) => (
          <div key={el.id} className="pa-el-row">
            <button className="linklike cell-primary" onClick={() => onInventory(el)} title="View this field's Data Inventory record">{el.fieldName}</button>
            {el.inventory && <Chip>{el.inventory.sensitivityTier}</Chip>}
            <button className="icon-btn xs" disabled={pending} style={{ marginLeft: "auto" }} onClick={() => onRemoveElement(el.id)} title="Unlink this field from the purpose" aria-label="Remove element"><Trash2 size={13} /></button>
          </div>
        ))}
        {seg.elements.length === 0 && <div className="cell-sub" style={{ padding: "4px 2px" }}>No fields under this purpose yet.</div>}
        <button className="btn ghost xs" onClick={onAddElement} style={{ alignSelf: "flex-start", marginTop: 4 }}><Plus size={12} /> Add element</button>
      </div>
    </div>
  );
}

function SegProcessor({ seg, crossBorder }: { seg: PurposeSegment; crossBorder: boolean }) {
  if (!seg.processorName) return <span className="cell-sub">Internal</span>;
  return (
    <span className="row" style={{ gap: 6, alignItems: "center", display: "inline-flex" }}>
      {seg.processorHasDpa ? (
        <Link href="/vendor-risk/register" className="row-link" title="Open the Vendor Risk (TPRM) record">{seg.processorName} <ExternalLink size={11} /></Link>
      ) : (
        <span className="cell-primary">{seg.processorName}</span>
      )}
      {!seg.processorHasDpa && <span className="warn-chip"><AlertTriangle size={11} /> No DPA on file</span>}
      {seg.processorJurisdiction && (crossBorder
        ? <span className="warn-chip" title={`Processes in ${jurisdictionLabel(seg.processorJurisdiction)} — outside India and not on the notified-country allowlist`}><Globe size={11} /> Cross-border — unreviewed</span>
        : <span className="cell-sub"><Globe size={11} style={{ verticalAlign: "-1px" }} /> {jurisdictionLabel(seg.processorJurisdiction)}</span>)}
    </span>
  );
}

/** Element name → its Data Inventory record, inline. */
function InventoryDrawer({ element, onClose }: { element: SegElement; onClose: () => void }) {
  const inv = element.inventory;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(460px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <strong>{element.fieldName}</strong>
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
            <p className="cell-sub" style={{ marginTop: 0 }}>No matching Data Inventory record — this field may be entered manually. <Link href="/discovery/inventory" className="row-link">Search the inventory →</Link></p>
          )}
        </div>
      </aside>
    </div>
  );
}

// -- Segment builder (shared by Add Activity + Add Purpose) -------------------

interface DraftElement { name: string; classifiedFieldId: string | null }

function SegmentBuilder({
  choice, setChoice, elements, setElements, purposes, processors, inventoryFields,
}: {
  choice: PurposeChoice; setChoice: (v: PurposeChoice) => void;
  elements: DraftElement[]; setElements: (v: DraftElement[]) => void;
  purposes: Opt[]; processors: Opt[]; inventoryFields: InventoryField[];
}) {
  const [fieldName, setFieldName] = useState("");
  const canAddElements = choice.mode !== "none" ? purposeChoiceValid(choice) : true;
  const addField = () => {
    const name = fieldName.trim();
    if (!name) return;
    const match = inventoryFields.find((f) => f.path.toLowerCase() === name.toLowerCase());
    setElements([...elements, { name, classifiedFieldId: match?.id ?? null }]);
    setFieldName("");
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <div className="section-label">Purpose</div>
        <PurposeSelector value={choice} onChange={setChoice} purposes={purposes} processors={processors} allowNone />
      </div>

      <div className="std-divider" />

      <div>
        <div className="section-label">Fields under this purpose <span className="cell-sub">{choice.mode === "none" ? "(add a purpose first)" : "(pick from inventory or type a new field)"}</span></div>
        {!canAddElements && choice.mode !== "none" && <p className="cell-sub" style={{ margin: "4px 0" }}>Complete the purpose above to add fields under it.</p>}
        {elements.length > 0 && (
          <div className="stack" style={{ gap: 6, margin: "6px 0 8px" }}>
            {elements.map((d, i) => (
              <div key={i} className="draft-row">
                <ChevronRight size={12} className="muted" />
                <span className="cell-primary">{d.name}</span>
                {d.classifiedFieldId ? <Chip>in inventory</Chip> : <span className="cell-sub">new field</span>}
                <button className="icon-btn xs" style={{ marginLeft: "auto" }} onClick={() => setElements(elements.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 6 }}>
          <input className="input" list="inv-fields" placeholder="Field name, e.g. PAN Number" value={fieldName} disabled={choice.mode !== "none" && !canAddElements} onChange={(e) => setFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }} />
          <datalist id="inv-fields">{inventoryFields.map((f) => <option key={f.id} value={f.path} />)}</datalist>
          <button className="btn sm" disabled={!fieldName.trim() || (choice.mode !== "none" && !canAddElements)} onClick={addField}><Plus size={13} /> Add field</button>
        </div>
      </div>
    </div>
  );
}

/** ADD ACTIVITY — purpose-first, continuous modal: activity, then purpose
 *  segment(s) each with their fields, "Add another purpose" repeatable. */
function AddActivityModal({
  purposes, processors, entities, inventoryFields, pending, onClose, onSubmit,
}: {
  purposes: Opt[]; processors: Opt[]; entities: Opt[]; inventoryFields: InventoryField[]; pending: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; entityId?: string | null; description?: string | null; segments: NewSegmentInput[] }, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [description, setDescription] = useState("");
  const [committed, setCommitted] = useState<{ choice: PurposeChoice; elements: DraftElement[] }[]>([]);
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "existing", existingPurposeTagId: null, processorId: null });
  const [elements, setElements] = useState<DraftElement[]>([]);
  const [nameError, setNameError] = useState(false);

  const curValid = purposeChoiceValid(choice) && choice.mode !== "none";
  const commit = () => {
    if (!curValid) return;
    setCommitted([...committed, { choice, elements }]);
    setChoice({ mode: "existing", existingPurposeTagId: null, processorId: null });
    setElements([]);
  };
  const submit = () => {
    if (!name.trim()) { setNameError(true); return; }
    const segs = [...committed];
    if (curValid) segs.push({ choice, elements });
    onSubmit({ name: name.trim(), entityId: entityId || null, description: description.trim() || null, segments: segs.map((s) => choiceToSegment(s.choice, s.elements)) }, () => {});
  };

  return (
    <Modal title="Add activity" size="lg" onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={pending || !name.trim()} onClick={submit}>{pending ? "Creating…" : "Create activity"}</button>
      </>
    }>
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

        {committed.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="section-label">Purposes added</div>
            {committed.map((c, i) => (
              <div key={i} className="draft-row">
                <span className="cell-primary">{c.choice.mode === "existing" ? (purposes.find((p) => p.id === (c.choice.mode === "existing" ? c.choice.existingPurposeTagId : ""))?.name ?? "purpose") : c.choice.mode === "propose" ? `Propose: ${c.choice.proposed.name}` : "Decide later"}</span>
                <span className="cell-sub">{c.elements.length} field{c.elements.length === 1 ? "" : "s"}</span>
                <button className="icon-btn xs" style={{ marginLeft: "auto" }} onClick={() => setCommitted(committed.filter((_, j) => j !== i))} aria-label="Remove purpose"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="add-element-form">
          <div className="section-label">{committed.length ? "Add another purpose" : "First purpose"}</div>
          <SegmentBuilder choice={choice} setChoice={setChoice} elements={elements} setElements={setElements} purposes={purposes} processors={processors} inventoryFields={inventoryFields} />
          <button className="btn sm" style={{ marginTop: 10 }} disabled={!curValid} onClick={commit}><Plus size={13} /> Add another purpose</button>
        </div>
      </div>
    </Modal>
  );
}

/** ADD PURPOSE — one purpose segment (+ its fields) onto an existing activity. */
function AddPurposeModal({
  activity, purposes, processors, inventoryFields, pending, onClose, onSubmit,
}: {
  activity: { id: string; name: string }; purposes: Opt[]; processors: Opt[]; inventoryFields: InventoryField[]; pending: boolean;
  onClose: () => void;
  onSubmit: (seg: NewSegmentInput, done: () => void) => void;
}) {
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "existing", existingPurposeTagId: null, processorId: null });
  const [elements, setElements] = useState<DraftElement[]>([]);
  const valid = purposeChoiceValid(choice);

  return (
    <Modal title="Add purpose" size="lg" subtitle={<>To: <strong>{activity.name}</strong></>} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={pending || !valid} onClick={() => onSubmit(choiceToSegment(choice, elements), () => {})}>{pending ? "Adding…" : "Add purpose"}</button>
      </>
    }>
      <SegmentBuilder choice={choice} setChoice={setChoice} elements={elements} setElements={setElements} purposes={purposes} processors={processors} inventoryFields={inventoryFields} />
    </Modal>
  );
}

/** ADD ELEMENT — one field under an existing purpose segment. */
function AddElementModal({
  purposeName, inventoryFields, pending, onClose, onSubmit,
}: {
  purposeName: string | null; inventoryFields: InventoryField[]; pending: boolean;
  onClose: () => void;
  onSubmit: (el: { name: string; classifiedFieldId?: string | null }, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const match = inventoryFields.find((f) => f.path.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal title="Add element" size="md" subtitle={<>Under purpose: <strong>{purposeName ?? "Decide later"}</strong></>} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={pending || !name.trim()} onClick={() => onSubmit({ name: name.trim(), classifiedFieldId: match?.id ?? null }, () => {})}>{pending ? "Adding…" : "Add element"}</button>
      </>
    }>
      <div className="section-label">Field <span className="cell-sub">(pick from inventory or type a new one)</span></div>
      <input className="input" list="inv-fields-el" placeholder="e.g. Phone Number" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <datalist id="inv-fields-el">{inventoryFields.map((f) => <option key={f.id} value={f.path} />)}</datalist>
      {name.trim() && <p className="cell-sub" style={{ marginTop: 6 }}>{match ? "Linked to an existing Data Inventory field." : "This will be recorded as a new field."}</p>}
    </Modal>
  );
}

/** Item 10 — land an unassigned inventory field onto an activity. */
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
    <Modal title="Assign field to an activity" size="md" onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={pending || !canSubmit} onClick={() => onSubmit(mode === "existing" ? { activityId } : { newActivityName: newName.trim() })}>{pending ? "Assigning…" : "Assign field"}</button>
      </>
    }>
      <p className="cell-sub" style={{ marginTop: 0 }}><span className="mono">{fieldName}</span> has no purpose recorded. Add it to an activity — it lands for review, then you place it under a purpose there.</p>
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
    </Modal>
  );
}
