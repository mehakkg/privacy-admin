"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, ExternalLink, X, AlertTriangle, Globe, Trash2, ChevronRight, MoreHorizontal } from "lucide-react";
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
  LIFECYCLE_LABEL, type LifecycleState, segmentComplete, purposeRollup,
} from "@/lib/processingActivity";
import { PurposeSelector, purposeChoiceValid, type PurposeChoice, type Opt } from "@/components/access/purposeSelector";
import type { ActionResult } from "@/app/actions/requests";

export interface InvInfo { fieldPath: string; category: string | null; sensitivityTier: string; sourceName: string }
export interface SegElement { id: string; fieldName: string; inventory: InvInfo | null }
export interface PurposeSegment {
  id: string;
  purposeName: string | null;
  purposeStatus: string | null;
  legalBasis: string | null;
  retention: string | null;
  processorName: string | null;
  processorJurisdiction: string | null;
  processorHasDpa: boolean;
  requestState: string;
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

function rollupOf(a: ActivityRow) {
  return purposeRollup(a.segments.map((s) => ({ complete: segmentComplete(s) })), a.legacyElements.length > 0);
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
 * PROCESSING ACTIVITIES — collapsed List + Detail Drawer. Each activity is one
 * row (name, severity rollup chip, entity, lifecycle, primary "Add purpose", and a
 * ⋯ menu for the rest); clicking the row opens the drawer with the nested
 * Purpose → Retention/Processor → Elements hierarchy. Purpose-first throughout.
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
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [addPurposeFor, setAddPurposeFor] = useState<{ id: string; name: string } | null>(null);
  const [addElementFor, setAddElementFor] = useState<{ segId: string; purposeName: string | null } | null>(null);
  const [inventoryFor, setInventoryFor] = useState<SegElement | null>(null);
  const [assigning, setAssigning] = useState<string | null>(assignField);

  const openActivity = activities.find((a) => a.id === openFor) ?? null;

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn primary sm" onClick={() => setAddActivityOpen(true)}><Plus size={14} /> Add activity</button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {activities.map((a) => (
          <ActivityListRow
            key={a.id}
            a={a}
            pending={pending}
            onOpen={() => setOpenFor(a.id)}
            onLifecycle={(v) => run(() => setLifecycleStateAction(a.id, v))}
            onArchive={() => run(() => requestArchiveAction(a.id))}
            onAddPurpose={() => setAddPurposeFor({ id: a.id, name: a.activity })}
          />
        ))}
        {activities.length === 0 && (
          <div className="empty" style={{ padding: 32 }}>No processing activities match. Add one — you&rsquo;ll declare its purpose first.</div>
        )}
      </div>
      <ActionError result={result} />

      {openActivity && (
        <ActivityDrawer
          a={openActivity}
          entities={entities}
          pending={pending}
          onClose={() => setOpenFor(null)}
          onLifecycle={(v) => run(() => setLifecycleStateAction(openActivity.id, v))}
          onEntity={(v) => run(() => setEntityAction(openActivity.id, v))}
          onArchive={() => run(() => requestArchiveAction(openActivity.id))}
          onAddPurpose={() => setAddPurposeFor({ id: openActivity.id, name: openActivity.activity })}
          onAddElement={(segId, purposeName) => setAddElementFor({ segId, purposeName })}
          onRemoveElement={(linkId) => run(() => removePurposeElementAction(linkId))}
          onRemoveSegment={(segId) => run(() => removePurposeSegmentAction(segId))}
          onInventory={(el) => setInventoryFor(el)}
        />
      )}

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

function KebabMenu({ items }: { items: { label: string; onClick: () => void; disabled?: boolean; title?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="kebab" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="kebab-btn" onClick={() => setOpen((o) => !o)} aria-label="More actions"><MoreHorizontal size={16} /></button>
      {open && (
        <div className="kebab-menu">
          {items.map((it, i) => (
            <button key={i} className="kebab-item" disabled={it.disabled} title={it.title} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityListRow({
  a, pending, onOpen, onLifecycle, onArchive, onAddPurpose,
}: {
  a: ActivityRow; pending: boolean;
  onOpen: () => void; onLifecycle: (v: string) => void; onArchive: () => void; onAddPurpose: () => void;
}) {
  const roll = rollupOf(a);
  const archived = a.lifecycleState === "archived";
  const hasRequested = a.segments.some((s) => s.requestState === "requested");
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={`pa-row${roll.kind === "none" ? " muted" : ""}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="pa-row-main">
        <ChevronRight size={15} className="muted pa-row-caret" />
        <span className="pa-row-name">{a.activity}</span>
        <Pill tone={roll.tone}>{roll.label}</Pill>
      </div>

      <div className="pa-row-actions" onClick={stop}>
        {a.entityName ? (
          <span className="cell-sub pa-entity">{a.entityName}</span>
        ) : (
          <button className="entity-warn" onClick={onOpen} title="No Fiduciary assigned"><AlertTriangle size={12} /> Assign entity →</button>
        )}
        <select className="input xs" value={archived ? "archived" : a.lifecycleState} disabled={pending || archived} onChange={(e) => onLifecycle(e.target.value)} style={{ width: 128 }} title={archived ? "Archived — a DPO ruling is required to reopen" : "Lifecycle"}>
          {(["active", "under_review"] as LifecycleState[]).map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>)}
          {archived && <option value="archived">{LIFECYCLE_LABEL.archived}</option>}
        </select>
        <button className="btn sm" onClick={onAddPurpose}><Plus size={13} /> Add purpose</button>
        <KebabMenu items={[
          { label: "Request archive", onClick: onArchive, disabled: pending || archived || hasRequested, title: hasRequested ? "A purpose is awaiting a DPO ruling" : undefined },
        ]} />
      </div>
    </div>
  );
}

function ActivityDrawer({
  a, entities, pending, onClose, onLifecycle, onEntity, onArchive, onAddPurpose, onAddElement, onRemoveElement, onRemoveSegment, onInventory,
}: {
  a: ActivityRow; entities: Opt[]; pending: boolean;
  onClose: () => void; onLifecycle: (v: string) => void; onEntity: (v: string) => void; onArchive: () => void;
  onAddPurpose: () => void;
  onAddElement: (segId: string, purposeName: string | null) => void;
  onRemoveElement: (linkId: string) => void;
  onRemoveSegment: (segId: string) => void;
  onInventory: (el: SegElement) => void;
}) {
  const roll = rollupOf(a);
  const archived = a.lifecycleState === "archived";
  const hasRequested = a.segments.some((s) => s.requestState === "requested");

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(620px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}><strong>{a.activity}</strong><Pill tone={roll.tone}>{roll.label}</Pill></span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="stack" style={{ gap: 3 }}>
              <span className="section-label">Lifecycle</span>
              <select className="input xs" value={archived ? "archived" : a.lifecycleState} disabled={pending || archived} onChange={(e) => onLifecycle(e.target.value)} style={{ width: 150 }}>
                {(["active", "under_review"] as LifecycleState[]).map((s) => <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>)}
                {archived && <option value="archived">{LIFECYCLE_LABEL.archived}</option>}
              </select>
            </div>
            <div className="stack" style={{ gap: 3 }}>
              <span className="section-label">Entity (Fiduciary)</span>
              <select className={`input xs${a.entityId ? "" : " warn-select"}`} value={a.entityId ?? ""} disabled={pending} onChange={(e) => onEntity(e.target.value)} style={{ width: 180 }}>
                <option value="">⚠ Unassigned entity</option>
                {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
              </select>
            </div>
            {!archived && (
              <div className="stack" style={{ gap: 3 }}>
                <span className="section-label">&nbsp;</span>
                <span title={hasRequested ? "A purpose is awaiting a DPO ruling" : "Archiving needs DPO approval"}>
                  <button className="btn ghost xs" disabled={pending || hasRequested} onClick={onArchive}>Request archive →</button>
                </span>
              </div>
            )}
          </div>

          {a.segments.length === 0 && a.legacyElements.length === 0 ? (
            <div className="empty" style={{ padding: 28, textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 500 }}>No purposes yet</p>
              <p className="cell-sub" style={{ margin: "0 0 14px" }}>Declare a purpose first — retention, legal basis and processor attach to it — then add the fields processed under it.</p>
              <button className="btn primary" onClick={onAddPurpose}><Plus size={14} /> Add purpose</button>
            </div>
          ) : (
            <>
              {a.segments.map((seg) => (
                <PurposeCard key={seg.id} seg={seg} pending={pending}
                  onAddElement={() => onAddElement(seg.id, seg.purposeName)}
                  onRemoveElement={onRemoveElement} onRemoveSegment={() => onRemoveSegment(seg.id)} onInventory={onInventory} />
              ))}

              {a.legacyElements.length > 0 && (
                <div className="pp-card legacy">
                  <div className="pp-head">
                    <Pill tone="yellow">Unassigned — legacy element, needs purpose</Pill>
                  </div>
                  <p className="cell-sub" style={{ margin: "0 0 8px" }}>These fields predate the purpose-first structure. Re-add them under a purpose above, then remove them here.</p>
                  <div className="pp-elements">
                    {a.legacyElements.map((el) => (
                      <div key={el.id} className="pp-el-row">
                        <span className="cell-primary">{el.elementName}</span>
                        <span className="cell-sub">{el.purposeName ? `was: ${el.purposeName}` : "no purpose"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn" style={{ marginTop: 14 }} onClick={onAddPurpose}><Plus size={14} /> Add another purpose</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Level 1 (purpose header) → Level 2 (retention/processor) → Level 3 (elements). */
function PurposeCard({
  seg, pending, onAddElement, onRemoveElement, onRemoveSegment, onInventory,
}: {
  seg: PurposeSegment; pending: boolean;
  onAddElement: () => void; onRemoveElement: (linkId: string) => void; onRemoveSegment: () => void; onInventory: (el: SegElement) => void;
}) {
  const deferred = !seg.purposeName;
  const crossBorder = isCrossBorderUnreviewed(seg.processorJurisdiction);
  const dpoOwned = !deferred;

  return (
    <div className="pp-card">
      {/* Level 1 — Purpose header */}
      <div className="pp-head">
        <span className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {dpoOwned && <span title="DPO-owned purpose" style={{ display: "inline-flex" }}><Lock size={13} className="muted" /></span>}
          <span className="pp-title">{deferred ? "Decide later — no purpose yet" : seg.purposeName}</span>
          {seg.legalBasis && <Chip>{lawfulBasisLabel(seg.legalBasis)}</Chip>}
          {seg.requestState === "requested" && <Pill tone="blue">Requested — awaiting DPO</Pill>}
          {seg.purposeStatus === "rejected" && <Pill tone="red">Purpose rejected</Pill>}
        </span>
        <button className="icon-btn xs" disabled={pending} onClick={onRemoveSegment} title="Remove this purpose" aria-label="Remove purpose"><Trash2 size={14} /></button>
      </div>

      {/* Level 2 — Purpose metadata: two clean fields, lock on the label only */}
      <div className="pp-meta">
        <div className="pp-meta-field">
          <span className="pp-meta-label">Retention {dpoOwned && seg.retention && <span title="DPO-set" style={{ display: "inline-flex" }}><Lock size={11} className="muted" /></span>}</span>
          <span className="pp-meta-value">{seg.retention ? seg.retention : (deferred ? "—" : <span style={{ color: "var(--yellow)" }}>Not set</span>)}</span>
        </div>
        <div className="pp-meta-field">
          <span className="pp-meta-label">Processor</span>
          <span className="pp-meta-value"><SegProcessor seg={seg} crossBorder={crossBorder} /></span>
        </div>
      </div>

      {/* Level 3 — Elements under this purpose */}
      <div className="pp-elements">
        {seg.elements.map((el) => (
          <div key={el.id} className="pp-el-row">
            <ChevronRight size={12} className="muted" />
            <button className="linklike cell-primary" onClick={() => onInventory(el)} title="View this field's Data Inventory record">{el.fieldName}</button>
            {el.inventory && <Chip>{el.inventory.sensitivityTier}</Chip>}
            <button className="icon-btn xs" disabled={pending} style={{ marginLeft: "auto" }} onClick={() => onRemoveElement(el.id)} title="Unlink this field" aria-label="Remove element"><Trash2 size={13} /></button>
          </div>
        ))}
        {seg.elements.length === 0 && <div className="pp-empty">No fields under this purpose yet</div>}
        <button className="btn ghost xs" onClick={onAddElement} style={{ alignSelf: "flex-start", marginTop: 4 }}><Plus size={12} /> Add element</button>
      </div>
    </div>
  );
}

function SegProcessor({ seg, crossBorder }: { seg: PurposeSegment; crossBorder: boolean }) {
  if (!seg.processorName) return <span className="cell-sub">Internal</span>;
  return (
    <span className="row" style={{ gap: 6, alignItems: "center", display: "inline-flex", flexWrap: "wrap" }}>
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
