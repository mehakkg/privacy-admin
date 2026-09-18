"use client";

import { X, Lock, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/ui";
import { SelfApprovedTag } from "@/components/access/selfApprovedTag";
import {
  capabilityById, MACRO_NAV_ORDER, ROLE_STATUS_LABEL, ROLE_STATUS_TONE,
  type MacroNav,
} from "@/lib/rbac";

export interface RoleView {
  id: string;
  name: string;
  description: string;
  roleType: string; // system | custom
  status: string;   // approved | draft | pending_dpo_approval
  capabilityIds: string[];
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  holders: number;
  selfApproved?: boolean;
}

/**
 * The one Role detail surface, used by both Identity & Access and Approved Policy.
 * `readOnly` (Approved Policy, or any system role) strips the assign/edit actions
 * and shows the policy-lock treatment instead — same component, different context,
 * never a fork.
 */
export function RoleDetailDrawer({
  role, readOnly = false, onClose, onAssign, onEdit,
}: {
  role: RoleView;
  readOnly?: boolean;
  onClose: () => void;
  onAssign?: (role: RoleView) => void;
  onEdit?: (role: RoleView) => void;
}) {
  const locked = readOnly || role.roleType === "system";
  const byGroup = MACRO_NAV_ORDER.map((g) => ({
    group: g as MacroNav,
    caps: role.capabilityIds.map(capabilityById).filter((c) => c && c.group === g),
  })).filter((x) => x.caps.length > 0);
  const highCount = role.capabilityIds.filter((id) => capabilityById(id)?.sensitivity === "high").length;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong>{role.name}</strong>
            <Pill tone={role.roleType === "system" ? "gray" : "blue"} dot={false}>{role.roleType === "system" ? "System" : "Custom"}</Pill>
            <Pill tone={ROLE_STATUS_TONE[role.status] ?? "gray"}>{ROLE_STATUS_LABEL[role.status] ?? role.status}</Pill>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="drawer-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>{role.description}</p>

          {locked && (
            <div className="notice policy" style={{ marginBottom: 12 }}>
              <div className="notice-title"><Lock size={12} /> {role.roleType === "system" ? "System role" : "Ratified policy"}</div>
              <div>
                Created and approved by the Data Protection Officer / CISO. Admin implements it and cannot change it here. Changes must be requested from the Data Protection Officer.
              </div>
            </div>
          )}

          {highCount > 0 && (
            <p className="row" style={{ gap: 6, color: "var(--red)", fontSize: 12.5, marginTop: 0 }}>
              <ShieldAlert size={13} /> Carries {highCount} high-sensitivity capabilit{highCount === 1 ? "y" : "ies"}.
            </p>
          )}

          <h3 className="drawer-section first">Capabilities ({role.capabilityIds.length})</h3>
          {byGroup.map(({ group, caps }) => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div className="section-label">{group}</div>
              <div className="stack" style={{ gap: 6, marginTop: 4 }}>
                {caps.map((c) => c && (
                  <div key={c.id} className="cap-row-static">
                    <div className="stack" style={{ gap: 1 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="cell-primary">{c.action}</span>
                        {c.sensitivity === "high" && <Pill tone="red">High sensitivity</Pill>}
                      </span>
                      <span className="cell-sub">{c.module} · {c.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <h3 className="drawer-section">Provenance</h3>
          <dl className="kv">
            {role.createdBy && <div style={{ display: "contents" }}><dt>Created by</dt><dd>{role.createdBy}</dd></div>}
            <div style={{ display: "contents" }}><dt>Approved by</dt><dd><span className="row" style={{ gap: 8, flexWrap: "wrap" }}>{role.approvedBy && role.approvedBy !== "—" ? `${role.approvedBy}${role.approvedAt ? ` · ${role.approvedAt}` : ""}` : "Not yet approved"}{role.selfApproved && <SelfApprovedTag compact />}</span></dd></div>
            <div style={{ display: "contents" }}><dt>Held by</dt><dd>{role.holders} {role.holders === 1 ? "person" : "people"}</dd></div>
          </dl>

          {!locked && (onAssign || onEdit) && (
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              {onEdit && role.roleType === "custom" && <button className="btn" onClick={() => onEdit(role)}>Edit role</button>}
              {onAssign && role.status === "approved" && <button className="btn primary" onClick={() => onAssign(role)}>Assign this role →</button>}
            </div>
          )}
          {locked && role.status === "approved" && onAssign && (
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button className="btn primary" onClick={() => onAssign(role)}>Assign this role →</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
