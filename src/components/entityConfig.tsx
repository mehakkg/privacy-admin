"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { addEntityAction, mapUserAction } from "@/app/actions/dataflow";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface EntityRow {
  id: string;
  name: string;
  kind: string;
  parentName: string | null;
  sdfStatus: string;
  sdfHistory: { status: string; note: string; at: string }[];
  mergerPending: boolean;
  usersMapped: number;
}
export interface MappingRow {
  id: string;
  userName: string;
  entityName: string;
  accessScope: string;
  additionalEntities: string[];
  justification: string | null;
}

const SDF_TONE: Record<string, PillTone> = {
  sdf: "purple",
  not_sdf: "gray",
  not_assessed: "yellow",
};
const SDF_LABEL: Record<string, string> = {
  sdf: "SDF",
  not_sdf: "Not SDF",
  not_assessed: "Not assessed",
};

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

// ---------------------------------------------------------------------------

export function EntitiesTable({
  rows,
  parents,
}: {
  rows: EntityRow[];
  parents: { id: string; name: string }[];
}) {
  const { pending, result, run } = useAction();
  const [draft, setDraft] = useState<{ name: string; kind: string; parentId: string; sdf: string } | null>(null);

  const columns: Column<EntityRow>[] = [
    {
      key: "name",
      header: "Entity",
      render: (e) => (
        <div className="cell-stack">
          <span className="cell-primary">{e.name}</span>
          {e.mergerPending && <Pill tone="yellow">Reconcile after merger</Pill>}
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      width: 120,
      render: (e) => <span className="cell-sub">{e.kind === "legal_entity" ? "Legal entity" : "Business unit"}</span>,
    },
    {
      key: "parent",
      header: "Parent",
      width: 150,
      render: (e) => <span className="cell-sub">{e.parentName ?? "—"}</span>,
    },
    {
      key: "sdf",
      header: "SDF status",
      width: 120,
      render: (e) => <Pill tone={SDF_TONE[e.sdfStatus] ?? "gray"}>{SDF_LABEL[e.sdfStatus] ?? e.sdfStatus}</Pill>,
    },
    {
      key: "users",
      header: "Users",
      width: 70,
      render: (e) => <span className="mono cell-sub">{e.usersMapped}</span>,
    },
  ];

  return (
    <div>
      {draft && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="dtable">
            <tbody>
              <tr className="pa-unsaved">
                <td><input className="pa-input" placeholder="Entity name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                <td>
                  <select className="pa-input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                    <option value="legal_entity">Legal entity</option>
                    <option value="business_unit">Business unit</option>
                  </select>
                </td>
                <td>
                  <select className="pa-input" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
                    <option value="">No parent (flat)</option>
                    {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="pa-input" value={draft.sdf} onChange={(e) => setDraft({ ...draft, sdf: e.target.value })}>
                    <option value="not_assessed">Not assessed</option>
                    <option value="sdf">SDF</option>
                    <option value="not_sdf">Not SDF</option>
                  </select>
                </td>
                <td>
                  <button className="btn xs primary" disabled={pending || !draft.name.trim()} onClick={() => run(() => addEntityAction(draft.name, draft.kind, draft.parentId || null, draft.sdf), () => setDraft(null))}>
                    Save
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <ListDetail<EntityRow>
        items={rows}
        columns={columns}
        emptyLabel="No entities yet."
        detailEmptyLabel="Select an entity."
        renderDetail={(e) => <EntityDrawer entity={e} />}
      />

      <div className="row" style={{ marginTop: 12 }}>
        {!draft && (
          <button className="btn primary sm" onClick={() => setDraft({ name: "", kind: "business_unit", parentId: "", sdf: "not_assessed" })}>
            + Add entity
          </button>
        )}
      </div>
      <ActionError result={result} />
    </div>
  );
}

function EntityDrawer({ entity }: { entity: EntityRow }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>{entity.name}</h3>
        <div className="cell-sub">
          {entity.kind === "legal_entity" ? "Legal entity" : "Business unit"}
          {entity.parentName && ` · under ${entity.parentName}`}
        </div>
      </div>

      <div>
        <div className="section-label">SDF status</div>
        <Pill tone={SDF_TONE[entity.sdfStatus] ?? "gray"}>{SDF_LABEL[entity.sdfStatus] ?? entity.sdfStatus}</Pill>
        {entity.sdfHistory.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div className="section-label">Change history</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {entity.sdfHistory.map((h, i) => (
                <li key={i} className="cell-sub">
                  {SDF_LABEL[h.status] ?? h.status} — {h.note} ({h.at.slice(0, 10)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {entity.mergerPending && <ReconcileFlow entityName={entity.name} />}
    </div>
  );
}

function ReconcileFlow({ entityName }: { entityName: string }) {
  const [step, setStep] = useState(0);
  if (step === 0) {
    return (
      <Notice tone="warn" title="Reconcile after merger">
        <p style={{ margin: "0 0 8px" }}>
          {entityName} is flagged for post-merger reconciliation. Consolidate its
          user mappings into the parent, then archive it.
        </p>
        <button className="btn primary sm" onClick={() => setStep(1)}>Start reconciliation</button>
      </Notice>
    );
  }
  if (step === 1) {
    return (
      <Notice tone="info" title="Step 1 of 2 — move user mappings">
        <p style={{ margin: "0 0 8px" }}>
          Every user mapped to {entityName} moves to the parent entity. Cross-entity
          mappings that named {entityName} are simplified to single-entity.
        </p>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn primary sm" onClick={() => setStep(2)}>Move mappings</button>
          <button className="btn ghost sm" onClick={() => setStep(0)}>Back</button>
        </div>
      </Notice>
    );
  }
  return (
    <Notice tone="ok" title="Step 2 of 2 — archive entity">
      <p style={{ margin: "0 0 8px" }}>
        Mappings moved. {entityName} can now be archived. Its history is retained
        in the audit log.
      </p>
      <button className="btn sm">Archive {entityName}</button>
    </Notice>
  );
}

// ---------------------------------------------------------------------------

export function UserMappingTable({
  rows,
  entities,
}: {
  rows: MappingRow[];
  entities: { id: string; name: string }[];
}) {
  const { pending, result, run } = useAction();
  const [draft, setDraft] = useState<{ userName: string; entityId: string; scope: string; extra: string[]; justification: string } | null>(null);

  const toggleExtra = (id: string) =>
    draft && setDraft({ ...draft, extra: draft.extra.includes(id) ? draft.extra.filter((x) => x !== id) : [...draft.extra, id] });

  return (
    <div>
      {draft && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="dtable">
            <tbody>
              <tr className={`pa-unsaved${draft.scope === "cross" ? " cross-entity" : ""}`}>
                <td><input className="pa-input" placeholder="User name" value={draft.userName} onChange={(e) => setDraft({ ...draft, userName: e.target.value })} /></td>
                <td>
                  <select className="pa-input" value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })}>
                    <option value="">— home entity —</option>
                    {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="pa-input" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                    <option value="single">Single entity</option>
                    <option value="cross">Cross-entity (shared function)</option>
                  </select>
                </td>
                <td>
                  <button className="btn xs primary" disabled={pending || !draft.userName.trim() || !draft.entityId} onClick={() => run(() => mapUserAction(draft.userName, draft.entityId, draft.scope, draft.extra, draft.justification), () => setDraft(null))}>
                    Save
                  </button>
                </td>
              </tr>
              {draft.scope === "cross" && (
                <tr className="cross-entity">
                  <td colSpan={4}>
                    <div className="section-label">Additional entities this user can access</div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {entities.filter((en) => en.id !== draft.entityId).map((en) => (
                        <button key={en.id} className={`btn xs ${draft.extra.includes(en.id) ? "primary" : "ghost"}`} onClick={() => toggleExtra(en.id)}>
                          {en.name}
                        </button>
                      ))}
                    </div>
                    <input className="input sm" placeholder="Justification (required) — e.g. shared compliance function" value={draft.justification} onChange={(e) => setDraft({ ...draft, justification: e.target.value })} />
                    <p className="cell-sub" style={{ margin: "4px 0 0" }}>
                      Cross-entity access is the deliberate exception, not the default — it needs a reason on record.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>User</th>
              <th>Current entity</th>
              <th>Access scope</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={m.accessScope === "cross" ? "cross-entity" : ""}>
                <td className="cell-primary">{m.userName}</td>
                <td className="cell-sub">{m.entityName}</td>
                <td>
                  {m.accessScope === "cross" ? (
                    <div className="cell-stack">
                      <Pill tone="orange">Cross-entity</Pill>
                      <span className="cell-sub">
                        + {m.additionalEntities.join(", ")} · {m.justification}
                      </span>
                    </div>
                  ) : (
                    <Pill tone="gray" dot={false}>Single entity</Pill>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3}><div className="empty">No user mappings in this view.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {!draft && (
          <button className="btn primary sm" onClick={() => setDraft({ userName: "", entityId: "", scope: "single", extra: [], justification: "" })}>
            + Map user
          </button>
        )}
      </div>
      <ActionError result={result} />
    </div>
  );
}
