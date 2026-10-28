"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check, Clock, Lock } from "lucide-react";
import {
  TASKS, ROLE_PERSON, ROLE_LABEL, visibleTasks, taskStatus, counts, effectiveOwner, isTaskDone, canComplete, goLive,
  type SetupState, type SetupTask, type SetupRole, type GoLiveFacts, type Capability,
} from "@/lib/setup/tasks";
import { completeTaskAction, inviteRolesAction, enableCapabilityAction, reassignTaskAction } from "@/app/actions/setup";

export function SetupScreen({ state, role, facts, days }: { state: SetupState; role: string; facts: GoLiveFacts; days: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [drawer, setDrawer] = useState<SetupTask | null>(null);
  const [invite, setInvite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmCap, setConfirmCap] = useState<Capability | null>(null);
  const [preflight, setPreflight] = useState<Capability | null>(null);

  const myRole = role as SetupRole;
  const c = counts(state);
  const caps = goLive(state, facts);
  const live = caps.filter((x) => x.status === "Live").length;
  const vis = visibleTasks(state);
  const myTasks = vis.filter((t) => effectiveOwner(t, state) === myRole);
  const myOpen = myTasks.filter((t) => !isTaskDone(t.id, state));

  const refresh = () => router.refresh();
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };
  const openTask = (t: SetupTask) => { if (t.drawer === "invite") setInvite(true); else setDrawer(t); };
  const complete = (id: string) => start(async () => { await completeTaskAction(id); setDrawer(null); refresh(); notify("Task completed."); });

  // Everyone's progress: one row per role.
  const roles: SetupRole[] = ["admin", "dpo", "ciso", "grievance"];
  const roleProgress = roles.map((r) => {
    const ts = vis.filter((t) => effectiveOwner(t, state) === r);
    const invited = r === "admin" || state.invited.includes(r);
    return { role: r, done: ts.filter((t) => isTaskDone(t.id, state)).length, total: ts.length, invited };
  });

  return (
    <div className="pa-list">
      <div className="pa-head">
        <div className="stack" style={{ gap: 4 }}>
          <div className="cell-sub">Setup</div>
          <h1 className="inv-title">Setup</h1>
          <p className="cell-sub" style={{ margin: 0 }}>Everything Meridian needs before going live. Each task goes to the person who owns it.</p>
        </div>
      </div>

      <div className="inv-card" style={{ marginTop: 12 }}>
        <span className="cell-sub">Required <strong className="tnum">{c.requiredDone}</strong> of {c.requiredTotal} done · Optional <strong className="tnum">{c.optionalDone}</strong> of {c.optionalTotal} done · <strong className="tnum">{days}</strong> days to 13 May 2027</span>
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: 16, marginTop: 16 }}>
        <div style={{ flex: "1 1 62%", minWidth: 0 }} className="stack" >
          <section className="stack" style={{ gap: 10 }}>
            <strong>My tasks</strong>
            {myTasks.length === 0 && <div className="inv-noresult">No tasks for the {ROLE_LABEL[myRole] ?? role} role.</div>}
            {myTasks.map((t) => <TaskCard key={t.id} t={t} state={state} role={role} onOpen={() => openTask(t)} onReassign={() => start(async () => { await reassignTaskAction(t.id, "admin"); refresh(); })} />)}
            {myTasks.length > 0 && myOpen.length === 0 && (
              <div className="inv-card">You’re done. Waiting on: {roleProgress.filter((r) => r.role !== myRole && r.invited && r.done < r.total).map((r) => `${ROLE_PERSON[r.role]} (${r.total - r.done})`).join(", ") || "no one"}.</div>
            )}
          </section>

          <section className="stack" style={{ gap: 8, marginTop: 20 }}>
            <strong>Everyone’s progress</strong>
            <div className="inv-card stack" style={{ gap: 0, padding: 0 }}>
              {roleProgress.map((r) => (
                <div key={r.role} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="av-name">{r.invited ? ROLE_PERSON[r.role] : ROLE_LABEL[r.role]}</span>
                    <span className="cell-sub">{ROLE_LABEL[r.role]}{r.invited ? ` · ${r.done} of ${r.total}` : ""}</span>
                  </div>
                  {r.invited
                    ? <div className="row" style={{ gap: 10, alignItems: "center" }}><span style={{ display: "inline-block", width: 90, height: 6, borderRadius: 999, background: "var(--border-soft)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${r.total ? (r.done / r.total) * 100 : 0}%`, background: "var(--green, #16a34a)" }} /></span>{r.done < r.total && r.role !== myRole && <button className="btn ghost sm" onClick={() => notify(`Reminder sent to ${ROLE_PERSON[r.role]}`)}>Remind</button>}</div>
                    : <button className="btn sec sm" onClick={() => setInvite(true)}>Invite</button>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ flex: "0 0 34%", minWidth: 280 }} className="stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}><strong>Go-live readiness</strong><span className="cell-sub">{live} of 3 live</span></div>
          {caps.map((cap) => <GoLiveCard key={cap.key} cap={cap} isAdmin={role === "admin"} onEnable={() => (cap.actionHref ? router.push(cap.actionHref) : setConfirmCap(cap))} onPreflight={() => setPreflight(cap)} />)}
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

function TaskCard({ t, state, role, onOpen, onReassign }: { t: SetupTask; state: SetupState; role: string; onOpen: () => void; onReassign: () => void }) {
  const st = taskStatus(t, state);
  const reassignable = (t.id === "C1" || t.id === "C2") && !state.invited.includes("ciso") && role === "admin";
  return (
    <div className="inv-card row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div className="stack" style={{ gap: 3, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, alignItems: "center" }}><strong style={{ fontSize: 14 }}>{t.title}</strong><span className="chip" style={{ fontSize: 10.5 }}>{t.required ? "Required" : "Optional"}</span><span className="cell-sub">{t.estimate}</span></div>
        <span className="cell-sub">{t.why}</span>
        <span className="cell-sub" style={{ marginTop: 2 }}>
          {st.kind === "done" ? <span style={{ color: "var(--green,#16a34a)" }}>Done ✓</span>
            : st.kind === "blocked" ? <span className="sev-warning">Blocked: waiting on {st.waitingOn}: {st.dep}</span>
            : "To do"}
        </span>
      </div>
      {st.kind !== "done" && (st.kind === "blocked"
        ? reassignable ? <button className="btn sec sm" onClick={onReassign}>Assign to me</button> : null
        : <button className="btn primary sm" onClick={onOpen}>Open</button>)}
    </div>
  );
}

function GoLiveCard({ cap, isAdmin, onEnable, onPreflight }: { cap: Capability; isAdmin: boolean; onEnable: () => void; onPreflight: () => void }) {
  const tone = cap.status === "Live" ? "success" : cap.status === "Ready" ? "info" : "neutral";
  return (
    <div className="inv-card stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontSize: 13 }}>{cap.title}</strong><span className={`rchip ${tone}`}>{cap.status}</span></div>
      <div className="stack" style={{ gap: 4 }}>
        {cap.requirements.map((r, i) => (
          <div key={i} className="row" style={{ gap: 6, alignItems: "flex-start" }}>
            {r.met ? <Check size={14} style={{ color: "var(--green,#16a34a)", flexShrink: 0, marginTop: 1 }} /> : <Clock size={14} style={{ color: "var(--text-3)", flexShrink: 0, marginTop: 1 }} />}
            <span className="cell-sub">{r.label}{!r.met && <> · <span className="sev-warning">waiting on {r.owner}</span></>}</span>
          </div>
        ))}
      </div>
      {cap.status !== "Live" && isAdmin && (
        cap.status === "Blocked"
          ? <div className="row" style={{ gap: 10, alignItems: "center" }}><button className="btn primary sm" disabled>{cap.action}</button><button className="link-btn" onClick={onPreflight}>What’s missing?</button></div>
          : <button className="btn primary sm" onClick={onEnable}>{cap.action}</button>
      )}
    </div>
  );
}

/** S6.3 pre-flight — the same requirement check every customer-facing publish runs,
 *  listing what's missing and who owns it. */
function PreflightModal({ cap, onClose }: { cap: Capability; onClose: () => void }) {
  const missing = cap.requirements.filter((r) => !r.met);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{cap.title} isn’t ready</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 8 }}>
          <p className="cell-sub" style={{ margin: 0 }}>This can’t go live until:</p>
          {missing.map((r, i) => <div key={i} className="row" style={{ gap: 6 }}><Clock size={14} style={{ color: "var(--text-3)", flexShrink: 0, marginTop: 1 }} /><span className="cell-sub">{r.label} · <span className="sev-warning">waiting on {r.owner}</span></span></div>)}
        </div>
        <div className="std-modal-foot"><button className="btn primary" onClick={onClose}>Got it</button></div>
      </div>
    </div>
  );
}

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

// --- Invite modal (S8) ------------------------------------------------------
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
          {INVITE_ROLES.map((r) => {
            const invited = state.invited.includes(r.role);
            return (
              <label key={r.role} className="row" style={{ gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border-soft)" }}>
                <input type="checkbox" checked={invited || sel.includes(r.role)} disabled={invited} onChange={() => toggle(r.role)} style={{ marginTop: 3 }} />
                <span className="stack" style={{ gap: 1 }}>
                  <span className="row" style={{ gap: 8, alignItems: "center" }}><strong style={{ fontSize: 13 }}>{ROLE_LABEL[r.role]}</strong>{r.required && <span className="chip" style={{ fontSize: 10 }}>Required</span>}{invited && <span className="cell-sub">· invited</span>}</span>
                  <span className="cell-sub">{r.desc} — {ROLE_PERSON[r.role]}</span>
                </span>
              </label>
            );
          })}
          <span className="cell-sub">Legal / Procurement (owns processor contracts) can be added later.</span>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={sel.length === 0} onClick={() => onInvited(sel)}>Send {sel.length} invite{sel.length === 1 ? "" : "s"}</button></div>
      </div>
    </div>
  );
}

// --- Task drawer (560px) ----------------------------------------------------
function TaskDrawer({ t, state, role, onClose, onComplete }: { t: SetupTask; state: SetupState; role: string; onClose: () => void; onComplete: () => void }) {
  const locked = !canComplete(t, role, state);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label={t.title} style={{ width: 560 }}>
        <div className="mp-drawer-head"><strong>{t.title}</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 12, overflow: "auto", padding: 16 }}>
          <DrawerBody t={t} />
          {locked && <div className="notice warn" style={{ margin: 0 }}><Lock size={12} /> This task is owned by {ROLE_PERSON[effectiveOwner(t, state)]} ({ROLE_LABEL[effectiveOwner(t, state)]}). Switch to that role to complete it.</div>}
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
