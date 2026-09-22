"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Tag, X } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { PurposeSelector, type PurposeChoice, purposeChoiceValid } from "@/components/access/purposeSelector";
import { createDataCategoryAction, setCategoryMembershipAction, deleteDataCategoryAction, bulkTagCategoryAction, tagFieldsToPurposeAction } from "@/app/actions/scenario6";
import type { PurposeTagInput } from "@/lib/engines/scenario6";
import type { ActionResult } from "@/app/actions/requests";

export interface FieldLite { id: string; fieldPath: string; sourceName: string; purposeName: string | null; categoryId: string | null }
export interface CategoryLite { id: string; name: string; description: string | null; memberCount: number }
export type Opt = { id: string; name: string; retention?: string | null; lawfulBasis?: string | null };

function toInput(c: PurposeChoice): PurposeTagInput | null {
  if (c.mode === "existing") return c.existingPurposeTagId ? { mode: "existing", existingPurposeTagId: c.existingPurposeTagId } : null;
  if (c.mode === "propose") return { mode: "propose", proposed: { name: c.proposed.name, description: c.proposed.description, legalBasis: c.proposed.legalBasis, retention: c.proposed.retention } };
  return null;
}

export function CategoriesManager({ categories, fields, purposes, processors }: { categories: CategoryLite[]; fields: FieldLite[]; purposes: Opt[]; processors: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { count?: number }) | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(categories[0]?.id ?? null);
  const [newCat, setNewCat] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [addPick, setAddPick] = useState<string[]>([]);
  const [tagModal, setTagModal] = useState<null | { kind: "category" | "fields"; ids: string[] }>(null);
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "none" });

  const run = (op: () => Promise<ActionResult & { count?: number }>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  const cat = categories.find((c) => c.id === selectedCat) ?? null;
  const members = cat ? fields.filter((f) => f.categoryId === cat.id) : [];
  const ungrouped = fields.filter((f) => !f.categoryId);

  return (
    <div>
      <ActionError result={result} />
      {result?.ok && result.count != null && <Notice tone="ok" title={`Tagged ${result.count} field(s) to the purpose`}>The purpose linkage was applied across every member field.</Notice>}

      <div className="dprr-grid" style={{ alignItems: "start" }}>
        {/* Category list + create */}
        <div className="card">
          <div className="card-head">Data categories</div>
          <div className="card-body">
            {categories.map((c) => (
              <div key={c.id} className={`pick-row${selectedCat === c.id ? " sel" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSelectedCat(c.id)}>
                <Tag size={13} /><span className="cell-primary" style={{ flex: 1 }}>{c.name}</span><Pill tone="gray" dot={false}>{c.memberCount}</Pill>
              </div>
            ))}
            {categories.length === 0 && <div className="empty">No categories yet.</div>}
            {creating ? (
              <div style={{ marginTop: 10 }}>
                <input className="input" placeholder="Category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} style={{ marginBottom: 6 }} />
                <input className="input" placeholder="Description (optional)" value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} style={{ marginBottom: 6 }} />
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn xs" onClick={() => setCreating(false)}>Cancel</button>
                  <button className="btn xs primary" disabled={pending || !newCat.name.trim()} onClick={() => run(() => createDataCategoryAction(newCat.name, newCat.description), () => { setCreating(false); setNewCat({ name: "", description: "" }); })}>Create</button>
                </div>
              </div>
            ) : <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setCreating(true)}><Plus size={13} /> New category</button>}
          </div>
        </div>

        {/* Category detail */}
        <div className="card">
          <div className="card-head">{cat ? cat.name : "Select a category"}</div>
          <div className="card-body">
            {cat && (
              <>
                {cat.description && <p className="cell-sub" style={{ margin: "0 0 8px" }}>{cat.description}</p>}
                <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <button className="btn sm primary" disabled={pending || members.length === 0} onClick={() => { setChoice({ mode: "none" }); setTagModal({ kind: "category", ids: [cat.id] }); }}><Tag size={13} /> Bulk-tag category to a purpose ({members.length})</button>
                  <button className="btn sm danger" disabled={pending} onClick={() => run(() => deleteDataCategoryAction(cat.id), () => setSelectedCat(null))}><Trash2 size={13} /> Delete (fields revert to ungrouped)</button>
                </div>
                <div className="section-label">Members</div>
                {members.map((f) => (
                  <div key={f.id} className="pick-row">
                    <span className="mono cell-primary" style={{ flex: 1 }}>{f.fieldPath}</span>
                    <span className="cell-sub">{f.purposeName ?? "untagged"}</span>
                    <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setCategoryMembershipAction(cat.id, [f.id], false))}><X size={12} /></button>
                  </div>
                ))}
                {members.length === 0 && <div className="cell-sub">No member fields yet.</div>}

                <div className="section-label" style={{ marginTop: 12 }}>Add fields (ungrouped)</div>
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {ungrouped.map((f) => (
                    <label key={f.id} className="pick-row"><input type="checkbox" checked={addPick.includes(f.id)} onChange={() => setAddPick((x) => x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id])} /><span className="mono" style={{ flex: 1 }}>{f.fieldPath}</span><span className="cell-sub">{f.sourceName}</span></label>
                  ))}
                  {ungrouped.length === 0 && <div className="cell-sub">All fields are grouped.</div>}
                </div>
                {addPick.length > 0 && <button className="btn sm" style={{ marginTop: 8 }} disabled={pending} onClick={() => run(() => setCategoryMembershipAction(cat.id, addPick, true), () => setAddPick([]))}><Plus size={13} /> Add {addPick.length} to {cat.name}</button>}
              </>
            )}
            {!cat && <div className="empty">Select or create a category.</div>}
          </div>
        </div>
      </div>

      {/* Tag-to-purpose modal (reuses the Purpose selector). */}
      {tagModal && (
        <Modal title={tagModal.kind === "category" ? "Bulk-tag category to a purpose" : "Tag fields to a purpose"} subtitle={tagModal.kind === "category" ? `This will tag all ${members.length} member field(s).` : `${tagModal.ids.length} field(s) selected.`} size="md" onClose={() => setTagModal(null)}
          footer={<><button className="btn" onClick={() => setTagModal(null)}>Cancel</button><button className="btn primary" disabled={pending || !purposeChoiceValid(choice) || choice.mode === "none"} onClick={() => {
            const inp = toInput(choice); if (!inp) return;
            run(() => tagModal.kind === "category" ? bulkTagCategoryAction(tagModal.ids[0], inp) : tagFieldsToPurposeAction(tagModal.ids, inp), () => setTagModal(null));
          }}>Apply</button></>}>
          <PurposeSelector value={choice} onChange={setChoice} purposes={purposes} processors={processors} allowNone={false} />
        </Modal>
      )}
    </div>
  );
}
