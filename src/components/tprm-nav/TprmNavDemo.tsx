"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, Settings, Bell, Search, ShieldCheck, Lock, ArrowLeft,
} from "lucide-react";
import {
  filterConsoleNav, filterPortalNav, consoleItemCount, portalItemCount,
  showSettingsGear, permsForRole, holds, type NavFlags, type RoleCode,
} from "@/lib/tprm-nav/filter";
import { CONSOLE_BADGES, PORTAL_BADGES, badgeFor } from "@/lib/tprm-nav/badges";

interface DemoActor { name: string; role: RoleCode; roleLabel: string; shell: "console" | "portal"; hasPrivacy: boolean }
const DEMO: DemoActor[] = [
  { name: "Neeraj Kulkarni", role: "ADMIN", roleLabel: "Administrator", shell: "console", hasPrivacy: false },
  { name: "Vikram Sethi", role: "RISK_MANAGER", roleLabel: "Risk Manager", shell: "console", hasPrivacy: false },
  { name: "Kavita Menon", role: "RISK_MANAGER", roleLabel: "Risk Manager (mapped from DPO)", shell: "console", hasPrivacy: true },
  { name: "Anjali Rao", role: "RISK_ANALYST", roleLabel: "Risk Analyst", shell: "console", hasPrivacy: false },
  { name: "Arjun Mehta", role: "VENDOR", roleLabel: "Vendor · Postwave Mailer", shell: "portal", hasPrivacy: false },
];

const COLLAPSE_KEY = "tprm-nav.collapsed";

export function TprmNavDemo() {
  const [actorIdx, setActorIdx] = useState(0);
  const [dora, setDora] = useState(true);
  const [placement, setPlacement] = useState<"settings" | "sidebar">("settings");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [noAccess, setNoAccess] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(COLLAPSE_KEY); if (raw) setCollapsed(new Set(JSON.parse(raw))); } catch { /* fine */ }
  }, []);
  const toggleSection = (label: string) => setCollapsed((s) => {
    const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...n])); } catch { /* fine */ }
    return n;
  });

  const actor = DEMO[actorIdx];
  const perms = useMemo(() => permsForRole(actor.role), [actor.role]);
  const flags: NavFlags = { dora, placement };

  const pick = (i: number) => { setActorIdx(i); setNoAccess(null); setShowSettings(false); };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Demo controls */}
      <div className="tn-controls">
        <label className="tn-ctl">Acting as
          <select className="input sm" value={actorIdx} onChange={(e) => pick(Number(e.target.value))}>
            {DEMO.map((d, i) => <option key={d.name} value={i}>{d.name} · {d.roleLabel}</option>)}
          </select>
        </label>
        {actor.shell === "console" && (
          <>
            <label className="tn-ctl">Placement
              <select className="input sm" value={placement} onChange={(e) => setPlacement(e.target.value as "settings" | "sidebar")}>
                <option value="settings">settings (⚙)</option>
                <option value="sidebar">sidebar (original)</option>
              </select>
            </label>
            <label className="tn-ctl tn-ctl-check"><input type="checkbox" checked={dora} onChange={(e) => setDora(e.target.checked)} /> DORA enabled</label>
          </>
        )}
        <span className="tn-count">{actor.shell === "console" ? consoleItemCount(perms, flags) : portalItemCount(perms)} items</span>
      </div>

      {actor.shell === "console"
        ? <ConsoleShell actor={actor} perms={perms} flags={flags} collapsed={collapsed} toggleSection={toggleSection} onHidden={setNoAccess} noAccess={noAccess} showSettings={showSettings} setShowSettings={setShowSettings} />
        : <PortalShell actor={actor} perms={perms} collapsed={collapsed} toggleSection={toggleSection} onHidden={setNoAccess} noAccess={noAccess} />}
    </div>
  );
}

// --- Console shell ----------------------------------------------------------
function ConsoleShell({ actor, perms, flags, collapsed, toggleSection, onHidden, noAccess, showSettings, setShowSettings }: {
  actor: DemoActor; perms: string[]; flags: NavFlags; collapsed: Set<string>; toggleSection: (l: string) => void;
  onHidden: (r: string | null) => void; noAccess: string | null; showSettings: boolean; setShowSettings: (b: boolean) => void;
}) {
  const sections = filterConsoleNav(perms, flags);
  const badges = CONSOLE_BADGES[actor.role];
  const gear = showSettingsGear(perms);
  const activeId = "dashboard";
  const activeSection = sections.find((s) => s.items.some((i) => i.id === activeId))?.label;

  return (
    <div className="tn-shell">
      <aside className="tn-side">
        <div className="tn-brand">
          <span className="tn-logo"><ShieldCheck size={16} /></span>
          <strong>miniOrange TPRM</strong>
          {actor.hasPrivacy && <span className="tn-switch" title="Product switcher — shown because this person has a Privacy role">▾</span>}
        </div>
        <nav className="tn-nav">
          {sections.map((s) => {
            const isActiveSection = s.label === activeSection;
            const isCollapsed = collapsed.has(s.label) && !isActiveSection;
            return (
              <div key={s.label} className="tn-group">
                <button className="tn-group-head" onClick={() => !isActiveSection && toggleSection(s.label)} aria-expanded={!isCollapsed}>
                  {!isActiveSection && (isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}
                  <span>{s.label}</span>
                </button>
                {!isCollapsed && s.items.map((it) => {
                  const b = badgeFor(badges, it.id);
                  return (
                    <div key={it.id} className={`tn-row${it.id === activeId ? " active" : ""}`}>
                      <span className="tn-row-label">{it.label}</span>
                      {b && <span className="tn-badge">{b}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="tn-main">
        <header className="tn-top">
          <span className="tn-top-left"><Search size={15} /> <span className="cell-sub">Search</span></span>
          <span className="tn-top-right">
            <Bell size={16} />
            {gear && <button className={`tn-gear${showSettings ? " on" : ""}`} onClick={() => setShowSettings(!showSettings)} title="Settings"><Settings size={16} /></button>}
            <span className="tn-avatar">{actor.name.split(" ").map((w) => w[0]).join("")}</span>
          </span>
        </header>
        <div className="tn-body">
          {noAccess ? <NoAccess route={noAccess} onBack={() => onHidden(null)} variant="console" />
            : showSettings ? <SettingsShell perms={perms} />
            : (
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>{actor.name}</h2>
                <p className="cell-sub" style={{ margin: "2px 0 0" }}>{actor.roleLabel} · {consoleItemCount(perms, flags)} sidebar items · ⚙ {gear ? "visible" : "hidden"}</p>
              </div>
              <p className="cell-sub" style={{ margin: 0 }}>The sidebar on the left is computed from this person&rsquo;s permissions — no per-role menu. Try switching the placement flag or turning DORA off.</p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn sec sm" onClick={() => onHidden("/pending-overrides")}>Open /pending-overrides by URL</button>
                <button className="btn sec sm" onClick={() => onHidden("/settings/users")}>Open /settings/users by URL</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Vendor portal shell (separate) -----------------------------------------
function PortalShell({ actor, perms, collapsed, toggleSection, onHidden, noAccess }: {
  actor: DemoActor; perms: string[]; collapsed: Set<string>; toggleSection: (l: string) => void; onHidden: (r: string | null) => void; noAccess: string | null;
}) {
  const sections = filterPortalNav(perms);
  return (
    <div className="tn-shell">
      <aside className="tn-side tn-side-portal">
        <div className="tn-brand"><span className="tn-logo tn-logo-portal"><ShieldCheck size={16} /></span><strong>Postwave Mailer</strong></div>
        <nav className="tn-nav">
          {sections.map((s, si) => {
            const label = s.label ?? `__top${si}`;
            const isCollapsed = s.label ? collapsed.has(label) : false;
            return (
              <div key={label} className="tn-group">
                {s.label && (
                  <button className="tn-group-head" onClick={() => toggleSection(label)} aria-expanded={!isCollapsed}>
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<span>{s.label}</span>
                  </button>
                )}
                {!isCollapsed && s.items.map((it) => {
                  const b = badgeFor(PORTAL_BADGES, it.id);
                  return (
                    <div key={it.id} className={`tn-row${it.id === "vTodo" ? " active" : ""}`}>
                      <span className="tn-row-label">{it.label}</span>
                      {b && <span className="tn-badge">{b}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="tn-main">
        <header className="tn-top">
          <span className="tn-top-left"><span className="cell-sub">All clients ▾</span></span>
          <span className="tn-top-right"><Bell size={16} /><span className="tn-avatar">AM</span></span>
        </header>
        <div className="tn-body">
          {noAccess ? <NoAccess route={noAccess} onBack={() => onHidden(null)} variant="portal" /> : (
            <div className="stack" style={{ gap: 12 }}>
              <div><h2 style={{ margin: 0 }}>Vendor portal</h2><p className="cell-sub" style={{ margin: "2px 0 0" }}>{actor.name} · {portalItemCount(perms)} items · no product switcher, no Acting-as</p></div>
              <p className="cell-sub" style={{ margin: 0 }}>A separate shell with its own sign-in. Instructions stays hidden until <code>PORTAL_INSTRUCTIONS:READ</code> exists in the fixture — no code change needed.</p>
              <button className="btn sec sm" onClick={() => onHidden("/portal/instructions")}>Open /portal/instructions by URL</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- No-access page (§7) ----------------------------------------------------
function NoAccess({ route, onBack, variant }: { route: string; onBack: () => void; variant: "console" | "portal" }) {
  const pageName = route.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "This page";
  return (
    <div className="tn-noaccess">
      <span className="tn-noaccess-icon"><Lock size={22} /></span>
      {variant === "console" ? (
        <>
          <h2>You don&rsquo;t have access to this page</h2>
          <p className="cell-sub">{pageName[0].toUpperCase() + pageName.slice(1)} needs a permission your role doesn&rsquo;t have. Ask your TPRM Administrator.</p>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <button className="btn primary sm">Request access</button>
            <button className="btn sec sm" onClick={onBack}>Go to Dashboard</button>
          </div>
        </>
      ) : (
        <>
          <h2>This isn&rsquo;t available in your portal.</h2>
          <div><button className="btn sec sm" onClick={onBack}>Go to To do</button></div>
        </>
      )}
    </div>
  );
}

// --- Settings shell (§4) ----------------------------------------------------
// Each TPRM item appears only if the user holds its READ permission; edit controls
// appear only with WRITE. Organisation is Admin-only (requires WRITE).
const TPRM_SETTINGS = [
  { label: "Questionnaires", read: ["TEMPLATES:READ", "CONFIG_IRQ:READ"] },
  { label: "Evidence & controls", read: ["CONFIG_CONTROLS:READ"] },
  { label: "Rules & cadence", read: ["CONFIG_RULES:READ"] },
  { label: "Contracts", read: ["CONFIG_FIELDS:READ"] },
  { label: "Data", read: ["CONFIG_FIELDS:READ", "CONFIG_REGULATORY:READ"] },
];
function SettingsShell({ perms }: { perms: string[] }) {
  const admin = perms.includes("*") || perms.includes("USERS:WRITE");
  const tprmItems = TPRM_SETTINGS.filter((s) => s.read.some((r) => holds(perms, r)));
  const canEdit = admin;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Settings</h2>
      {!canEdit && <div className="tn-banner">You can view these settings. Changes are made by an Administrator.</div>}
      {admin && (
        <div className="inv-card stack" style={{ gap: 6 }}>
          <strong>Organisation</strong>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="chip">Users &amp; Roles</span><span className="chip">Branding</span></div>
          <span className="cell-sub">Admin only · editable</span>
        </div>
      )}
      <div className="inv-card stack" style={{ gap: 6 }}>
        <strong>TPRM</strong>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {tprmItems.map((it) => <span key={it.label} className="chip">{it.label}</span>)}
        </div>
        <span className="cell-sub">{canEdit ? "Editable" : "Read-only"}</span>
      </div>
    </div>
  );
}
