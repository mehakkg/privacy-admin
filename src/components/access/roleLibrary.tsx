"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, LayoutGrid, Table as TableIcon, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/ui";
import { ROLE_STATUS_LABEL, ROLE_STATUS_TONE, capabilityById } from "@/lib/rbac";
import { RoleDetailDrawer, type RoleView } from "@/components/access/roleDetailDrawer";
import { RoleComposer } from "@/components/access/roleComposer";

/**
 * SCREEN 1 — Role Library. Card grid (default) or table, over the single Role
 * table. System roles show the policy-lock; custom roles show edit/duplicate.
 * "Request new role" opens the Composer. The detail drawer is the shared one,
 * used read-only from Approved Policy too.
 */
export function RoleLibrary({ roles, templates, combined = false }: { roles: RoleView[]; templates: RoleView[]; combined?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [open, setOpen] = useState<RoleView | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<RoleView | null>(null);

  const hasCustom = roles.some((r) => r.roleType === "custom");
  const onAssign = (r: RoleView) => router.push(`/access/assignments?role=${r.id}`);
  const onEdit = (r: RoleView) => { setOpen(null); setEditing(r); setComposing(true); };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div className="seg-toggle" role="tablist" aria-label="View">
          <button className={`seg-btn${view === "cards" ? " active" : ""}`} onClick={() => setView("cards")}><LayoutGrid size={13} /> Cards</button>
          <button className={`seg-btn${view === "table" ? " active" : ""}`} onClick={() => setView("table")}><TableIcon size={13} /> Table</button>
        </div>
        <button className="btn primary sm" onClick={() => { setEditing(null); setComposing(true); }}><Plus size={14} /> Request new role</button>
      </div>

      {roles.length === 0 ? (
        <div className="empty" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 500 }}>No roles match these filters.</p>
        </div>
      ) : !hasCustom && view === "cards" && roles.every((r) => r.roleType === "system") ? (
        <>
          <div className="notice info" style={{ marginBottom: 12 }}>
            <div className="notice-title">No custom roles yet</div>
            <div>Every role below is a system role. Compose a custom one when no template fits.</div>
            <button className="btn primary sm" style={{ marginTop: 8 }} onClick={() => { setEditing(null); setComposing(true); }}><Plus size={14} /> Request new role</button>
          </div>
          <CardGrid roles={roles} onOpen={setOpen} />
        </>
      ) : view === "cards" ? (
        <CardGrid roles={roles} onOpen={setOpen} />
      ) : (
        <RoleTable roles={roles} onOpen={setOpen} />
      )}

      {open && <RoleDetailDrawer role={open} onClose={() => setOpen(null)} onAssign={onAssign} onEdit={onEdit} />}
      {composing && <RoleComposer editing={editing} templates={templates} combined={combined} onClose={() => { setComposing(false); setEditing(null); }} />}
    </div>
  );
}

function CardGrid({ roles, onOpen }: { roles: RoleView[]; onOpen: (r: RoleView) => void }) {
  return (
    <div className="role-grid">
      {roles.map((r) => {
        const high = r.capabilityIds.filter((id) => capabilityById(id)?.sensitivity === "high").length;
        return (
          <button key={r.id} className="role-card" onClick={() => onOpen(r)}>
            <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
              <span className="row" style={{ gap: 6 }}>
                {r.roleType === "system" && <Lock size={13} className="muted" />}
                <span className="cell-primary">{r.name}</span>
              </span>
              <Pill tone={ROLE_STATUS_TONE[r.status] ?? "gray"}>{ROLE_STATUS_LABEL[r.status] ?? r.status}</Pill>
            </div>
            <p className="cell-sub role-card-desc">{r.description || "No description."}</p>
            <div className="row" style={{ justifyContent: "space-between", marginTop: "auto" }}>
              <span className="chip-count">{r.capabilityIds.length} capabilit{r.capabilityIds.length === 1 ? "y" : "ies"}</span>
              {high > 0 && <span className="cell-sub" style={{ color: "var(--red)" }}><ShieldAlert size={11} style={{ verticalAlign: "-1px" }} /> {high} high</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RoleTable({ roles, onOpen }: { roles: RoleView[]; onOpen: (r: RoleView) => void }) {
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr><th>Role</th><th>Type</th><th>Description</th><th>Capabilities</th><th>Status</th><th>Approved by</th></tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => onOpen(r)}>
              <td className="cell-primary"><span className="row" style={{ gap: 6 }}>{r.roleType === "system" && <Lock size={12} className="muted" />}{r.name}</span></td>
              <td><Pill tone={r.roleType === "system" ? "gray" : "blue"} dot={false}>{r.roleType === "system" ? "System" : "Custom"}</Pill></td>
              <td className="cell-sub">{r.description}</td>
              <td className="cell-sub">{r.capabilityIds.length}</td>
              <td><Pill tone={ROLE_STATUS_TONE[r.status] ?? "gray"}>{ROLE_STATUS_LABEL[r.status] ?? r.status}</Pill></td>
              <td className="cell-sub">{r.approvedBy && r.approvedBy !== "—" ? r.approvedBy : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
