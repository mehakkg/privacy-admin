"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Pill } from "@/components/ui";
import { ROLE_STATUS_LABEL, ROLE_STATUS_TONE } from "@/lib/rbac";
import { RoleDetailDrawer, type RoleView } from "@/components/access/roleDetailDrawer";

/**
 * Approved Policy → Role definitions. Read-only view of ratified roles (system,
 * or approved custom — drafts/pending don't appear here). Clicking a row opens
 * the SAME detail drawer as Identity & Access, passed readOnly.
 */
export function RoleDefinitions({ roles }: { roles: RoleView[] }) {
  const [open, setOpen] = useState<RoleView | null>(null);
  return (
    <>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Role name</th><th>Description</th><th>Capabilities</th><th>Status</th><th>Approved by</th></tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td className="cell-primary"><span className="row" style={{ gap: 6 }}><Lock size={12} className="muted" />{r.name}</span></td>
                <td className="muted">{r.description}</td>
                <td className="cell-sub">{r.capabilityIds.length}</td>
                <td><Pill tone={ROLE_STATUS_TONE[r.status] ?? "gray"}>{ROLE_STATUS_LABEL[r.status] ?? r.status}</Pill></td>
                <td className="cell-sub">{r.approvedBy && r.approvedBy !== "—" ? r.approvedBy : "—"}</td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr><td colSpan={5}><div className="empty"><p style={{ margin: 0 }}>No ratified roles yet.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {open && <RoleDetailDrawer role={open} readOnly onClose={() => setOpen(null)} />}
    </>
  );
}
