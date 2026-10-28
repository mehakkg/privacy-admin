"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check, ChevronDown, ChevronRight, Lock, Info } from "lucide-react";
import {
  TASKS, STAGES, ROLE_PERSON, ROLE_LABEL, visibleTasks, taskStatus, counts, effectiveOwner, isTaskDone, canComplete,
  goLive, stageState, nextUpTask, unlocks, ownerLabel, roleAssigned,
  type SetupState, type SetupTask, type SetupRole, type GoLiveFacts, type Capability, type Stage,
} from "@/lib/setup/tasks";
import { completeTaskAction, inviteRolesAction, enableCapabilityAction, reassignTaskAction } from "@/app/actions/setup";

const VERB: Record<string, string> = {
  A1: "Confirm link", A2: "Confirm link", A3: "Add fiduciaries", A4: "Invite team", A5: "Apply pack",
  D1: "Confirm SDF status", D2: "Confirm contact", D3: "Review purposes", D4: "Set routing", C1: "Set contacts", C2: "Connect SIEM", G1: "Set window",
};
const RAIL_ROLES: (SetupRole | "legal")[] = ["admin", "dpo", "grievance", "ciso", "legal"];

export function SetupScreen({ state, role, facts, days }: { state: SetupState; role: string; facts: GoLiveFacts; days: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  const myRole = role as SetupRole;
  const [drawer, setDrawer] = useState<SetupTask | null>(null);
  const [invite, setInvite] = useState(false);
  const [confirmCap, setConfirmCap] = useState<Capability | null>(null);
  const [preflight, setPreflight] = useState<Capability | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine">(role === "admin" ? "all" : "mine");

  const c = counts(state);
  const caps = goLive(state, facts);
  const live = caps.filter((x) => x.status === "Live").length;
  const vis = visibleTasks(state);
  const next = nextUpTask(state, role);
  const readyCap = caps.find((x) => x.status === "Ready");

  const refresh = () => router.refresh();
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };
  const openTask = (t: SetupTask) => { if (t.drawer === "invite") setInvite(true); else setDrawer(t); };
  const complete = (id: string) => start(async () => { await completeTaskAction(id); setDrawer(null); refresh(); notify("Task completed."); });

  const waiting = (["dpo", "ciso", "grievance"] as SetupRole[]).filter((r) => r !== myRole && state.invited.includes(r))
    .map((r) => { const open = vis.filter((t) => effectiveOwner(t, state) === r && !isTaskDone(t.id, state)).length; return open > 0 ? `${ROLE_PERSON[r]} (${open})` : null; })
    .filter(Boolean).join(", ");

  const chipTone = days <= 14 ? "var(--red,#dc2626)" : days <= 60 ? "var(--yellow-700,#b45309)" : "var(--text-3)";

  return (
    <div className="pa-list">
      <div className="pa-head" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="inv-title">Setup</h1>
          <p className="cell-sub" style={{ margin: 0 }}>Everything Meridian needs before going live. Each task goes to the person who owns it.</p>
        </div>
        <span className="chip" title="DPDP Rules 3 and 5–16 apply from this date." style={{ color: chipTone, borderColor: chipTone, display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 600 }}>{days} days to 13 May 2027 <Info size={12} /></span>
      </div>

      {/* Progress band */}
      <div className="inv-card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 6, flex: "1 1 280px" }}>
            <div className="row" style={{ gap: 3 }}>{Array.from({ length: 8 }).map((_, i) => <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: i < c.requiredDone ? "var(--green,#16a34a)" : "var(--border-soft,#e5e7eb)" }} />)}</div>
            <span className="cell-sub">{c.requiredDone} of 8 required done</span>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {caps.map((cap, i) => <span key={cap.key} className="row" style={{ gap: 8, alignItems: "center" }}><a href={`#cap-${cap.key}`} className="chip" style={{ fontSize: 10.5, ...(cap.status === "Live" ? { background: "var(--green,#16a34a)", color: "#fff", borderColor: "transparent" } : cap.status === "Ready" ? { borderColor: "var(--accent,#2563eb)", color: "var(--accent,#2563eb)" } : {}) }}>{["①", "②", "③"][i]} {cap.title.replace("Rights & grievance ", "").replace("Consent ", "")}</a>{i < 2 && <span className="cell-sub">→</span>}</span>)}
            <span className="cell-sub">{live} of 3 live</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: 16, marginTop: 16 }}>
        <div style={{ flex: "1 1 64%", minWidth: 0 }} className="stack">
          {/* Next up */}
          <NextUp task={next} readyCap={!next && role === "admin" ? readyCap : undefined} state={state} waiting={waiting} onOpen={openTask} onEnable={(cap) => (cap.actionHref ? router.push(cap.actionHref) : setConfirmCap(cap))} onRemind={() => notify("Reminder sent.")} />

          {/* Filter */}
          <div className="mp-segment" style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All tasks {vis.length}</button>
            <button className={filter === "mine" ? "on" : ""} onClick={() => setFilter("mine")}>Only mine {vis.filter((t) => effectiveOwner(t, state) === myRole).length}</button>
          </div>

          {STAGES.map((stage) => <StageBlock key={stage.n} stage={stage} state={state} role={role} filter={filter} onOpen={openTask} onInvite={() => setInvite(true)} onRemind={() => notify("Reminder sent.")} onReassign={(id) => start(async () => { await reassignTaskAction(id, "admin"); refresh(); })} />)}

          {/* Stage 3 — Go live */}
          <section className="stack" style={{ gap: 8, marginTop: 8 }}>
            <div className="row" style={{ gap: 10, alignItems: "center" }}><span className="stage-badge">③</span><strong>Go live</strong><span className="cell-sub">{live} of 3 live</span></div>
            <div className="inv-card stack" style={{ gap: 0, padding: 0 }}>
              {caps.map((cap) => <CapRow key={cap.key} cap={cap} isAdmin={role === "admin"} onEnable={() => (cap.actionHref ? router.push(cap.actionHref) : setConfirmCap(cap))} />)}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside style={{ flex: "0 0 32%", minWidth: 280, position: "sticky", top: 12 }} className="stack">
          <TeamRail state={state} role={role} onInvite={() => setInvite(true)} onRemind={(p) => notify(`Reminder sent to ${p}`)} />
          <div className="inv-card stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Recent activity</strong>
            <div className="stack" style={{ gap: 4 }}>
              {isTaskDone("A2", state) && <span className="cell-sub">10:42 · Ritu Nair confirmed the DLP link</span>}
              {isTaskDone("A1", state) && <span className="cell-sub">10:41 · Ritu Nair confirmed the IAM link</span>}
              {!isTaskDone("A1", state) && <span className="cell-sub">No setup activity yet.</span>}
            </div>
            <Link href="/audit?category=setup" className="link-btn">View audit log →</Link>
          </div>
        </aside>
      </div>

      {drawer && <TaskDrawer t={drawer} state={state} role={role} onClose={() => setDrawer(null)} onComplete={() => complete(drawer.id)} />}
      {invite && <InviteModal state={state} onClose={() => setInvite(false)} onInvited={(roles) => start(async () => { await inviteRolesAction(roles); setInvite(false); refresh(); notify(`${roles.length} invite${roles.length === 1 ? "" : "s"} sent. They’ll see their own setup tasks when they sign in.`); })} />}
      {confirmCap && <ConfirmCapModal cap={confirmCap} onClose={() => setConfirmCap(null)} onConfirm={() => start(async () => { await enableCapabilityAction(confirmCap.key); setConfirmCap(null); refresh(); notify(`${confirmCap.title} is live.`); })} />}
      {preflight && <PreflightModal cap={preflight} onClose={() => setPreflight(null)} />}
      {toast && <div className="toast" role="status" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "var(--text, #0f172a)", color: "#fff", padding: "10px 16px", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>{toast}</div>}
    </div>
  );
}

// --- Next up ----------------------------------------------------------------
function NextUp({ task, readyCap, state, waiting, onOpen, onEnable, onRemind }: {
  task: SetupTask | null; readyCap?: Capability; state: SetupState; waiting: string;
  onOpen: (t: SetupTask) => void; onEnable: (cap: Capability) => void; onRemind: () => void;
}) {
  const border = "2px solid var(--accent,#2563eb)";
  if (task) {
    const u = unlocks(task.id, state);
    return (
      <div className="inv-card" style={{ borderLeft: border, boxShadow: "0 2px 10px rgba(16,24,40,0.06)" }}>
        <div className="cell-sub" style={{ fontWeight: 600, marginBottom: 6 }}>Next up for you</div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div className="stack" style={{ gap: 3, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}><strong style={{ fontSize: 15 }}>{task.title}</strong><span className="cell-sub">{task.required ? "Required" : "Optional"} · {task.estimate}</span></div>
            <span className="cell-sub">{task.why}</span>
            {u.label && <span className="cell-sub">Unlocks: {u.label}</span>}
          </div>
          <button className="btn primary" onClick={() => onOpen(task)}>{VERB[task.id] ?? "Open"}</button>
        </div>
      </div>
    );
  }
  if (readyCap) {
    return (
      <div className="inv-card" style={{ borderLeft: border, boxShadow: "0 2px 10px rgba(16,24,40,0.06)" }}>
        <div className="cell-sub" style={{ fontWeight: 600, marginBottom: 6 }}>Next up for you</div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>{readyCap.title}</strong><span className="cell-sub">Every requirement is met.</span></div>
          <button className="btn primary" onClick={() => onEnable(readyCap)}>{readyCap.action.replace(/ →$/, "")}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="inv-card" style={{ borderLeft: border }}>
      <div className="cell-sub" style={{ fontWeight: 600, marginBottom: 6 }}>Next up for you</div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>You’re done for now.{waiting ? ` Waiting on ${waiting}.` : ""}</span>
        {waiting && <button className="btn sec sm" onClick={onRemind}>Remind</button>}
      </div>
    </div>
  );
}

// --- Stage ------------------------------------------------------------------
function StageBlock({ stage, state, role, filter, onOpen, onInvite, onRemind, onReassign }: {
  stage: Stage; state: SetupState; role: string; filter: "all" | "mine";
  onOpen: (t: SetupTask) => void; onInvite: () => void; onRemind: () => void; onReassign: (id: string) => void;
}) {
  const ss = stageState(stage, state);
  const autoCollapsed = ss.state === "Done ✓";
  const [open, setOpen] = useState(!autoCollapsed);
  const [showOpt, setShowOpt] = useState(false);
  const vis = visibleTasks(state);
  const reqTasks = stage.required.map((id) => TASKS.find((t) => t.id === id)!);
  const optTasks = stage.optional.map((id) => vis.find((t) => t.id === id)).filter(Boolean) as SetupTask[];
  const mineOnly = (t: SetupTask) => filter === "all" || effectiveOwner(t, state) === role;
  const shownReq = reqTasks.filter(mineOnly);

  return (
    <section className="stack" style={{ gap: 6, marginTop: 8 }} id={`stage-${stage.n}`}>
      <button className="row" style={{ gap: 10, alignItems: "center", background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setOpen((o) => !o)}>
        <span className="stage-badge">{["①", "②"][stage.n - 1]}</span>
        <strong>{stage.title}</strong>
        <span className="cell-sub">{ss.done} of {ss.total} · {ss.state}</span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open && (
        <div className="inv-card stack" style={{ gap: 0, padding: 0 }}>
          {shownReq.length === 0 && <div className="cell-sub" style={{ padding: 12 }}>Nothing for you here.</div>}
          {shownReq.map((t) => <TaskRow key={t.id} t={t} state={state} role={role} onOpen={onOpen} onInvite={onInvite} onRemind={onRemind} onReassign={onReassign} />)}
          {optTasks.length > 0 && filter === "all" && (
            <div style={{ borderTop: "1px solid var(--border-soft)" }}>
              <button className="cell-sub" style={{ background: "none", border: 0, cursor: "pointer", padding: "10px 14px", width: "100%", textAlign: "left" }} onClick={() => setShowOpt((s) => !s)}>
                + {optTasks.length} optional{!showOpt && optTasks[0] ? `: ${optTasks[0].title}${optTasks[0].dependsOn.length ? ` · after ${TASKS.find((x) => x.id === optTasks[0].dependsOn[0])?.title}` : ""}` : ""}
              </button>
              {showOpt && optTasks.map((t) => <TaskRow key={t.id} t={t} state={state} role={role} optional onOpen={onOpen} onInvite={onInvite} onRemind={onRemind} onReassign={onReassign} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({ t, state, role, optional, onOpen, onInvite, onRemind, onReassign }: {
  t: SetupTask; state: SetupState; role: string; optional?: boolean;
  onOpen: (t: SetupTask) => void; onInvite: () => void; onRemind: () => void; onReassign: (id: string) => void;
}) {
  const st = taskStatus(t, state);
  const owner = effectiveOwner(t, state);
  const isMine = owner === role;
  const done = st.kind === "done";
  const assigned = roleAssigned(owner, state.invited);
  const reassignable = (t.id === "C1" || t.id === "C2") && !state.invited.includes("ciso") && role === "admin";
  // ✓ done · ● your turn · ◐ waiting on an assigned teammate · ○ not started / blocked.
  const icon = done ? <span style={{ color: "var(--green,#16a34a)" }}>✓</span>
    : isMine && st.kind === "todo" ? <span style={{ color: "var(--accent,#2563eb)" }}>●</span>
    : !isMine && assigned ? <span style={{ color: "var(--yellow-700,#b45309)" }}>◐</span>
    : <span style={{ color: "var(--border,#cbd5e1)" }}>○</span>;

  // Action priority: your turn (verb / After) → unassigned owner (Invite) → assigned (Remind).
  let action: React.ReactNode = null;
  if (done) action = <span className="cell-sub">Done</span>;
  else if (isMine) action = st.kind === "blocked" ? <span className="cell-sub">After {st.dep}</span> : <button className="btn sec sm" onClick={() => onOpen(t)}>{VERB[t.id] ?? "Open"}</button>;
  else if (reassignable) action = <button className="btn sec sm" onClick={() => onReassign(t.id)}>Assign to me</button>;
  else if (!assigned) action = <button className="link-btn" onClick={onInvite}>Invite {ROLE_LABEL[owner]}</button>;
  else action = <button className="btn ghost sm" onClick={onRemind}>Remind</button>;

  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
        <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <span style={{ fontWeight: isMine && st.kind === "todo" ? 600 : 400, fontSize: 13 }}>{t.title}{optional && <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>Optional</span>}</span>
          <span className="cell-sub">{isMine ? "You" : assigned ? ROLE_PERSON[owner] : <span className="sev-warning">{ROLE_LABEL[owner]} · not invited</span>}{st.kind !== "done" ? ` · ${t.estimate}` : ""}</span>
        </span>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  );
}

// --- Stage 3 capability row -------------------------------------------------
function CapRow({ cap, isAdmin, onEnable }: { cap: Capability; isAdmin: boolean; onEnable: () => void }) {
  const unmet = cap.requirements.filter((r) => !r.met);
  return (
    <div id={`cap-${cap.key}`} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
        <span style={{ width: 18, textAlign: "center", flexShrink: 0, color: cap.status === "Live" ? "var(--green,#16a34a)" : cap.status === "Ready" ? "var(--accent,#2563eb)" : "var(--border,#cbd5e1)" }}>{cap.status === "Live" ? "✓" : cap.status === "Ready" ? "●" : "○"}</span>
        <span className="stack" style={{ gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13 }}>{cap.title}</span>
          {cap.status === "Blocked" && <span className="cell-sub">Needs: {unmet.map((r) => `${r.label.replace(/^At least one |^Rule 9 /, "")}${r.owner.includes("not invited") ? ` (${r.owner})` : ""}`).join(", ")}</span>}
          {cap.status === "Live" && <span className="cell-sub" style={{ color: "var(--green,#16a34a)" }}>Live</span>}
        </span>
      </div>
      {cap.status === "Ready" && isAdmin && <button className="btn primary sm" onClick={onEnable}>{cap.action}</button>}
    </div>
  );
}

// --- Team rail --------------------------------------------------------------
function TeamRail({ state, role, onInvite, onRemind }: { state: SetupState; role: string; onInvite: () => void; onRemind: (p: string) => void }) {
  const vis = visibleTasks(state);
  return (
    <div className="inv-card stack" style={{ gap: 0, padding: 0 }}>
      <div style={{ padding: "12px 14px" }}><strong style={{ fontSize: 13 }}>Your team</strong></div>
      {RAIL_ROLES.map((r) => {
        const assigned = r === "admin" || (r !== "legal" && state.invited.includes(r as SetupRole));
        const tasks = r === "legal" ? [] : vis.filter((t) => effectiveOwner(t, state) === r);
        const done = tasks.filter((t) => isTaskDone(t.id, state)).length;
        const open = tasks.length - done;
        const status = !assigned ? "Not invited" : r === "admin" || (r !== "legal" && state.invited.includes(r as SetupRole)) ? "Active" : "Invited · not signed in";
        return (
          <div key={r} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--border-soft)", gap: 10 }}>
            <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: assigned ? "var(--accent,#2563eb)" : "transparent", border: assigned ? "none" : "1.5px dashed var(--border,#cbd5e1)" }} />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{assigned && r !== "legal" ? ROLE_PERSON[r as SetupRole] : ROLE_LABEL[r as SetupRole] ?? "Legal"}</span>
                <span className="cell-sub">{assigned && r !== "legal" ? `${ROLE_LABEL[r as SetupRole]} · ${done}/${tasks.length}` : status}</span>
              </span>
            </div>
            {!assigned ? <button className="btn sec sm" onClick={onInvite}>Invite</button> : open > 0 && r !== role ? <button className="btn ghost sm" onClick={() => onRemind(ROLE_PERSON[r as SetupRole])}>Remind</button> : null}
          </div>
        );
      })}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-soft)" }}><button className="link-btn" onClick={onInvite}>Invite people</button></div>
    </div>
  );
}

// --- Modals / drawer (reused) -----------------------------------------------
function ConfirmCapModal({ cap, onClose, onConfirm }: { cap: Capability; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{cap.action.replace(/ →$/, "")}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body"><p className="cell-sub" style={{ margin: 0 }}>Open the rights & grievance portal for Meridian Financial Services and Meridian Securities Ltd? Data Principals will be able to submit requests from today.</p></div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={onConfirm}>{cap.action.replace(/ →$/, "")}</button></div>
      </div>
    </div>
  );
}

function PreflightModal({ cap, onClose }: { cap: Capability; onClose: () => void }) {
  const missing = cap.requirements.filter((r) => !r.met);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{cap.title} isn’t ready</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 8 }}><p className="cell-sub" style={{ margin: 0 }}>This can’t go live until:</p>{missing.map((r, i) => <span key={i} className="cell-sub">· {r.label} — <span className="sev-warning">{r.owner}</span></span>)}</div>
        <div className="std-modal-foot"><button className="btn primary" onClick={onClose}>Got it</button></div>
      </div>
    </div>
  );
}

const INVITE_ROLES: { role: SetupRole; required: boolean; desc: string }[] = [
  { role: "dpo", required: true, desc: "Owns governance: approves purposes and activities, confirms SDF status." },
  { role: "ciso", required: false, desc: "Owns security: breach contacts, SIEM, access reviews." },
  { role: "grievance", required: true, desc: "Handles Data Principal grievances and rights escalations." },
];
function InviteModal({ state, onClose, onInvited }: { state: SetupState; onClose: () => void; onInvited: (roles: SetupRole[]) => void }) {
  const [sel, setSel] = useState<SetupRole[]>(INVITE_ROLES.filter((r) => !state.invited.includes(r.role)).map((r) => r.role));
  const toggle = (r: SetupRole) => setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal md" role="dialog" aria-modal="true" style={{ width: 640, maxWidth: "94vw" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Invite your team</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 10 }}>
          {INVITE_ROLES.map((r) => { const invited = state.invited.includes(r.role); return (
            <label key={r.role} className="row" style={{ gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border-soft)" }}>
              <input type="checkbox" checked={invited || sel.includes(r.role)} disabled={invited} onChange={() => toggle(r.role)} style={{ marginTop: 3 }} />
              <span className="stack" style={{ gap: 1 }}><span className="row" style={{ gap: 8, alignItems: "center" }}><strong style={{ fontSize: 13 }}>{ROLE_LABEL[r.role]}</strong>{r.required && <span className="chip" style={{ fontSize: 10 }}>Required</span>}{invited && <span className="cell-sub">· invited</span>}</span><span className="cell-sub">{r.desc} — {ROLE_PERSON[r.role]}</span></span>
            </label>
          ); })}
          <span className="cell-sub">Legal / Procurement (owns processor contracts) can be added later.</span>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={sel.length === 0} onClick={() => onInvited(sel)}>Send {sel.length} invite{sel.length === 1 ? "" : "s"}</button></div>
      </div>
    </div>
  );
}

function TaskDrawer({ t, state, role, onClose, onComplete }: { t: SetupTask; state: SetupState; role: string; onClose: () => void; onComplete: () => void }) {
  const locked = !canComplete(t, role, state);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label={t.title} style={{ width: 560 }}>
        <div className="mp-drawer-head"><strong>{t.title}</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 12, overflow: "auto", padding: 16 }}>
          <DrawerBody t={t} />
          {locked && <div className="notice warn" style={{ margin: 0 }}><Lock size={12} /> This task is owned by {ownerLabel(effectiveOwner(t, state), state.invited)}. Switch to that role to complete it.</div>}
        </div>
        <div className="mp-drawer-foot row" style={{ justifyContent: "flex-end", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={locked} onClick={onComplete}>{t.drawer === "starter" ? "Apply selected" : "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

function DrawerBody({ t }: { t: SetupTask }) {
  switch (t.drawer) {
    case "iam": return <><p className="cell-sub" style={{ marginTop: 0 }}>We found Meridian’s miniOrange IAM (<span className="mono">meridian-iam</span>): <strong>148 users</strong>, <strong>12 groups</strong>, SSO ready.</p><p className="cell-sub">Confirming turns on SSO for <span className="mono">meridianfs.in</span> and lets invite pickers search the directory.</p></>;
    case "dlp": return <><p className="cell-sub" style={{ marginTop: 0 }}>We found Meridian’s DLP (<span className="mono">meridian-dlp</span>) with <strong>6 sources</strong>.</p><p className="cell-sub">Confirming starts the first sync, which populates Data inventory and the register coverage.</p></>;
    case "fiduciaries": return <><div className="notice info" style={{ margin: "0 0 10px" }}>Meridian Financial Services Ltd is pre-filled from your contract. Check and confirm.</div><p className="cell-sub">Manage the full table, add Meridian Securities Ltd, and set short names in <Link href="/settings/organization?tab=fiduciaries" className="link-btn">Settings › Fiduciaries</Link>. The DPO and published-contact fields are confirmed in task D2.</p></>;
    case "starter": return <><p className="cell-sub" style={{ marginTop: 0 }}>The banking starter pack drafts, for your review:</p><ul className="cell-sub" style={{ margin: 0, paddingLeft: 18 }}><li>6 purposes (created as <strong>Drafts</strong>, sent to Kavita Menon)</li><li>3 notice templates</li><li>6 activity templates</li></ul><p className="cell-sub">Nothing is approved or published by applying this.</p></>;
    case "sdf": return <><p className="cell-sub" style={{ marginTop: 0 }}>Per fiduciary: Not notified / Notified on {"{date}"} + reference. Pre-filled from your readiness profile (“No”).</p><p className="cell-sub">SDF status is notified by the Government, not self-assessed (Section 10).</p></>;
    case "contact": return <><p className="cell-sub" style={{ marginTop: 0 }}>Per fiduciary: the published contact email (e.g. <span className="mono">privacy@meridianfs.in</span>), the named person, and where it’s published (e.g. <span className="mono">meridianfs.in/privacy</span>).</p><p className="cell-sub">Rule 9: this contact must be on your website or app, and in every rights response.</p></>;
    case "review_purposes": return <p className="cell-sub" style={{ marginTop: 0 }}>Review the starter purposes in <Link href="/data-map/purposes?tab=work" className="link-btn">Purposes › My work</Link>, approving or rejecting each with a reason.</p>;
    case "escalation": return <p className="cell-sub" style={{ marginTop: 0 }}>Choose who rules on retention conflicts, rights-request exceptions and purpose changes. All default to the DPO.</p>;
    case "breach": return <p className="cell-sub" style={{ marginTop: 0 }}>Set the primary and backup incident contacts. When a breach is confirmed, the Board must be informed (Rule 7 sets a 72-hour window for the detailed report).</p>;
    case "siem": return <p className="cell-sub" style={{ marginTop: 0 }}>Stream access logs to Wazuh / Splunk / Sumo Logic / Custom HTTP for monitoring.</p>;
    case "grievance": return <p className="cell-sub" style={{ marginTop: 0 }}>Set the grievance contact channel and a response window in days (default 30). Rule 14 requires a response within 90 days.</p>;
    default: return null;
  }
}
