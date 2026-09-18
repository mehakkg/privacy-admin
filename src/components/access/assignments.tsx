"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { assignRoleAction, retryProvisioningAction } from "@/app/actions/rbac";
import { summarise } from "@/lib/rbac";
import type { RoleView } from "@/components/access/roleDetailDrawer";
import type { ActionResult } from "@/app/actions/requests";

export interface ProvSystem { system: string; status: string; detail?: string }
export interface AssignmentView {
  id: string;
  roleName: string;
  roleType: string;
  userName: string;
  entityName: string | null;
  scope: string[];
  justification: string;
  grantedAt: string;
  status: string;
  provisioning: ProvSystem[];
  provisioningStatus: string; // granted | partial | failed | pending
}

const PROV_TONE: Record<string, "green" | "yellow" | "red" | "gray"> = { granted: "green", partial: "yellow", failed: "red", pending: "gray" };
const PROV_LABEL: Record<string, string> = { granted: "Granted", partial: "Partial", failed: "Failed", pending: "Pending" };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function Assignments({
  assignments, roles, entities, systems, initialRoleId,
}: {
  assignments: AssignmentView[];
  roles: RoleView[];
  entities: { id: string; name: string }[];
  systems: string[];
  initialRoleId?: string | null;
}) {
  const { pending, result, run } = useRun();
  const [flowOpen, setFlowOpen] = useState(Boolean(initialRoleId));

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{assignments.length} assignment{assignments.length === 1 ? "" : "s"} · every grant carries a recorded justification and a viewed summary.</span>
        <button className="btn primary sm" onClick={() => setFlowOpen(true)}><Plus size={14} /> New assignment</button>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Person</th><th>Role</th><th>Entity</th><th>Scope</th><th>Provisioning</th><th>Granted</th></tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <AssignmentRow key={a.id} a={a} pending={pending} onRetry={(system) => run(() => retryProvisioningAction(a.id, system))} />
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={6}><div className="empty"><p style={{ margin: 0 }}>No assignments yet. Grant an approved role to someone to begin.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {flowOpen && (
        <AssignmentFlow
          roles={roles}
          entities={entities}
          systems={systems}
          initialRoleId={initialRoleId}
          pending={pending}
          onClose={() => setFlowOpen(false)}
          onSubmit={(input, done) => run(() => assignRoleAction(input), () => { setFlowOpen(false); done(); })}
        />
      )}
    </div>
  );
}

function AssignmentRow({ a, pending, onRetry }: { a: AssignmentView; pending: boolean; onRetry: (system: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)}>
        <td className="cell-primary"><span className="row" style={{ gap: 6 }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{a.userName}</span></td>
        <td>{a.roleName}</td>
        <td className="cell-sub">{a.entityName ?? "Unassigned entity"}</td>
        <td className="cell-sub">{a.scope.join(", ")}</td>
        <td><Pill tone={PROV_TONE[a.provisioningStatus] ?? "gray"}>{PROV_LABEL[a.provisioningStatus] ?? a.provisioningStatus}</Pill></td>
        <td className="cell-sub">{a.grantedAt}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--bg-muted)" }}>
            <div className="stack" style={{ gap: 8, padding: "4px 2px" }}>
              {a.provisioningStatus === "partial" && (
                <span className="warn-chip"><AlertTriangle size={11} /> Partial — {a.provisioning.filter((p) => p.status === "granted").length} of {a.provisioning.length} systems confirmed. Not complete.</span>
              )}
              <div className="stack" style={{ gap: 4 }}>
                {a.provisioning.map((p) => (
                  <div key={p.system} className="prov-row">
                    {p.status === "granted" ? <CheckCircle2 size={14} color="var(--green)" /> : p.status === "failed" ? <XCircle size={14} color="var(--red)" /> : <AlertTriangle size={14} color="var(--yellow)" />}
                    <span className="cell-primary">{p.system}</span>
                    <span className="cell-sub">{p.status === "granted" ? "Confirmed" : p.detail ?? p.status}</span>
                    {p.status === "failed" && <button className="btn ghost xs" disabled={pending} onClick={(e) => { e.stopPropagation(); onRetry(p.system); }} style={{ marginLeft: "auto" }}>Retry</button>}
                  </div>
                ))}
              </div>
              <span className="cell-sub">Justification: {a.justification}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** SCREEN 4 — Assignment flow with a persistent live summary. */
function AssignmentFlow({
  roles, entities, systems, initialRoleId, pending, onClose, onSubmit,
}: {
  roles: RoleView[]; entities: { id: string; name: string }[]; systems: string[];
  initialRoleId?: string | null; pending: boolean;
  onClose: () => void;
  onSubmit: (input: { roleId: string; userName: string; entityId?: string | null; scopeSystems: string[]; justification: string }, done: () => void) => void;
}) {
  const [roleId, setRoleId] = useState<string>(initialRoleId ?? "");
  const [roleQuery, setRoleQuery] = useState("");
  const [userName, setUserName] = useState("");
  const [entityId, setEntityId] = useState<string>("");
  // Narrowest default: nothing pre-checked beyond the first system.
  const [scope, setScope] = useState<string[]>(systems.length ? [systems[0]] : []);
  const [justification, setJustification] = useState("");

  const role = roles.find((r) => r.id === roleId) ?? null;
  const matches = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [roleQuery, roles]);

  const canSubmit = Boolean(roleId && userName.trim() && justification.trim() && scope.length);
  const toggleSystem = (s: string) => setScope((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal composer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0 }}>Assign a role</h3>
            <p className="cell-sub" style={{ margin: "2px 0 0" }}>You&rsquo;ll see, in plain language, exactly what you&rsquo;re granting before you confirm.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="composer-grid">
          <div className="composer-catalog">
            <div className="section-label">Role</div>
            {!roleId ? (
              <>
                <input className="input sm" placeholder="Search approved roles…" value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} style={{ margin: "6px 0 8px" }} />
                <div className="stack" style={{ gap: 6 }}>
                  {matches.map((r) => (
                    <button key={r.id} className="pick-item" onClick={() => setRoleId(r.id)}>
                      <span className="cell-primary">{r.name}</span>
                      <span className="cell-sub">{r.description}</span>
                    </button>
                  ))}
                  {matches.length === 0 && <span className="cell-sub">No approved roles match.</span>}
                </div>
              </>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="cell-primary">{role?.name}</span>
                  <button className="btn ghost xs" onClick={() => setRoleId("")}>Change</button>
                </div>
                <div>
                  <div className="section-label">Person</div>
                  <input className="input" placeholder="Full name" value={userName} onChange={(e) => setUserName(e.target.value)} />
                </div>
                <div>
                  <div className="section-label">Entity (Fiduciary)</div>
                  <select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                    <option value="">Unassigned entity</option>
                    {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="section-label">Scope — systems <span className="cell-sub">(narrowest default)</span></div>
                  <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                    {systems.map((s) => (
                      <label key={s} className={`cap-row${scope.includes(s) ? " on" : ""}`}>
                        <input type="checkbox" checked={scope.includes(s)} onChange={() => toggleSystem(s)} />
                        <span className="cell-primary">{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-label">Justification <span className="cell-sub">(required)</span></div>
                  <textarea className="input" rows={2} placeholder="Why this person needs this access" value={justification} onChange={(e) => setJustification(e.target.value)} />
                  {!justification.trim() && <span className="cell-sub" style={{ color: "var(--yellow)" }}>A justification is the evidence for the grant.</span>}
                </div>
              </div>
            )}
          </div>

          <aside className="composer-summary">
            <div className="section-label">What you&rsquo;re granting</div>
            {role ? (
              <>
                <p className="summary-text">{summarise(role.capabilityIds)}</p>
                <dl className="kv" style={{ marginTop: 8 }}>
                  <div style={{ display: "contents" }}><dt>Role</dt><dd>{role.name}</dd></div>
                  <div style={{ display: "contents" }}><dt>To</dt><dd>{userName || "—"}</dd></div>
                  <div style={{ display: "contents" }}><dt>Scope</dt><dd>{scope.join(", ") || "—"}</dd></div>
                </dl>
                <p className="cell-sub" style={{ marginTop: 8 }}>{role.roleType === "custom" ? "This role is custom — the grant is recorded directly." : "Provisioning runs across each system in scope; a partial result is never reported as success."}</p>
              </>
            ) : (
              <p className="cell-sub">Pick a role to see a plain-English preview of exactly what will be granted.</p>
            )}

            <div className="stack" style={{ gap: 8, marginTop: 16 }}>
              <button className="btn primary" disabled={pending || !canSubmit} onClick={() => onSubmit({ roleId, userName, entityId: entityId || null, scopeSystems: scope, justification }, () => {})}>
                {pending ? "Granting…" : "Confirm and grant"}
              </button>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
