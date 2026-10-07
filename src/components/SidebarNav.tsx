"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, AlertTriangle, BarChart3, Bell, Building2, Boxes, CalendarClock,
  ChevronUp, ClipboardCheck, ClipboardList, Cookie, Database, FileCheck2,
  FileSearch, FileText, Fingerprint, FlaskConical, Gauge, Globe, Handshake,
  Inbox, KeyRound, Languages, LayoutDashboard, Link2, ListChecks, Lock, Map,
  MapPin, Plug, RefreshCw, Rocket, ScanSearch, Scale, Settings, Shield,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Timer, TriangleAlert, Upload,
  Users, UserCog, Workflow, type LucideIcon,
} from "lucide-react";

/**
 * Sidebar nav — Privacy Console shell model (app-shell-ui-spec §5): exactly two
 * node types. A GROUP renders as an uppercase header + collapsible list of
 * ITEMS; a top-level item with no group renders as a bare item. Every item
 * carries a stroke icon. Collapse (to the 68px icon rail) is driven from the
 * header hamburger via the `collapsed` prop; when collapsed, group headers hide
 * and every group renders open.
 */

// Icon for a top-level group's bare item (Dashboard, Approved Policy, …).
const GROUP_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  "data-map": Map,
  consent: FileCheck2,
  rights: Inbox,
  "tprm-dashboard": Scale,
  breach: ShieldAlert,
  tprm: Handshake,
  risk: Gauge,
  access: UserCog,
  "audit-escalation": Scale,
  governance: ShieldCheck,
  "data-protection": Shield,
  settings: Settings,
};

// A keyword → icon heuristic so every child item gets a meaningful stroke icon
// without hand-assigning all of them. First match wins; falls back to a dot.
const KEYWORD_ICON: [RegExp, LucideIcon][] = [
  [/dashboard/i, LayoutDashboard],
  [/scan config|scan sched|schedul/i, CalendarClock],
  [/scan result|scan/i, ScanSearch],
  [/inventory/i, Boxes],
  [/data categor|categor/i, ListChecks],
  [/source/i, Database],
  [/processing activit|activit/i, ClipboardList],
  [/review queue|triage|queue/i, Inbox],
  [/quarantine/i, Lock],
  [/identity resolution|identity/i, Fingerprint],
  [/data flow|flow/i, Workflow],
  [/ropa|record of/i, FileText],
  [/notice/i, FileText],
  [/consent collection|consent record|consent/i, FileCheck2],
  [/branch|bc.?point|capture/i, MapPin],
  [/unification|omnichannel/i, Link2],
  [/integrity|artifact/i, ShieldCheck],
  [/cookie categor/i, ListChecks],
  [/cookie/i, Cookie],
  [/script/i, FileSearch],
  [/geo/i, Globe],
  [/language/i, Languages],
  [/policy re-?consent|re-?consent|expiry/i, Timer],
  [/compliance report|report/i, BarChart3],
  [/legacy import|import/i, Upload],
  [/isolation/i, Shield],
  [/webhook|delivery/i, RefreshCw],
  [/deletion|fulfil/i, ListChecks],
  [/escalation/i, TriangleAlert],
  [/sla/i, Timer],
  [/incident/i, ShieldAlert],
  [/investigation/i, FileSearch],
  [/notification/i, Bell],
  [/trend|analytic|insight/i, BarChart3],
  [/vendor|register/i, Handshake],
  [/assessment/i, ClipboardCheck],
  [/sub-processor|disclosure/i, FileText],
  [/configuration|config/i, SlidersHorizontal],
  [/role/i, KeyRound],
  [/assignment/i, ClipboardCheck],
  [/approval/i, ClipboardCheck],
  [/drift/i, Activity],
  [/entity|organization|organisation/i, Building2],
  [/protection rule|rule/i, Workflow],
  [/scope/i, SlidersHorizontal],
  [/risk/i, Gauge],
  [/audit|evidence/i, ClipboardCheck],
  [/ruling/i, Scale],
  [/user/i, Users],
  [/integration/i, Plug],
  [/onboard/i, Rocket],
  [/setup/i, SlidersHorizontal],
  [/analytics source|source/i, FlaskConical],
];

function childIcon(label: string): LucideIcon {
  for (const [re, Icon] of KEYWORD_ICON) if (re.test(label)) return Icon;
  return ShieldCheck;
}

export type NavChild =
  | { href: string; label: string; ready: boolean; badge?: number; badgeLabel?: string; warn?: string | null; heading?: never }
  | { heading: string; href?: never; label?: never; ready?: never; badge?: never; badgeLabel?: never; warn?: never };

export interface NavGroup {
  key: string;
  label: string;
  href: string;
  ready: boolean;
  badge?: number;
  badgeLabel?: string;
  warn?: string | null;
  children?: NavChild[];
  /** Pinned to the bottom of the sidebar, below a divider (Settings). */
  footer?: boolean;
  /** Show a lock marker — a governance page Admin can read but not edit. */
  locked?: boolean;
}

export type NavSection = { section: string };
export type NavEntry = NavSection | NavGroup;
function isSection(e: NavEntry): e is NavSection {
  return (e as NavSection).section !== undefined;
}

const OPEN_KEY = "privacy-admin.sidebar.open";

function matches(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

export function SidebarNav({
  groups,
  active,
  collapsed,
}: {
  groups: NavEntry[];
  active: string;
  collapsed: boolean;
}) {
  const pathname = usePathname() || active;

  // Longest-prefix match → exactly one active row (a child, never its group).
  const candidates: string[] = [];
  for (const g of groups) {
    if (isSection(g)) continue;
    if (g.children?.length) { for (const c of g.children) if (c.href) candidates.push(c.href); }
    else candidates.push(g.href);
  }
  let activeHref: string | null = null;
  for (const href of candidates) {
    if (matches(pathname, href) && (activeHref === null || href.length > activeHref.length)) activeHref = href;
  }

  const groupOwnsActive = (g: NavGroup): boolean =>
    g.children?.length
      ? g.children.some((c) => c.href !== undefined && c.href === activeHref)
      : g.href === activeHref;

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) if (!isSection(g)) initial[g.key] = groupOwnsActive(g);
    return initial;
  });

  // Restore persisted open state, then always keep the active group open.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_KEY);
      if (raw) setOpen((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch { /* fine */ }
  }, []);
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) if (!isSection(g) && groupOwnsActive(g)) next[g.key] = true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggle = (key: string) =>
    setOpen((o) => {
      const next = { ...o, [key]: !o[key] };
      try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* fine */ }
      return next;
    });

  const renderItem = (href: string, label: string, Icon: LucideIcon, ready: boolean, opts: { badge?: number; badgeLabel?: string; warn?: string | null; locked?: boolean } = {}) => {
    const showBadge = opts.badge !== undefined && opts.badge > 0;
    const badgeText = showBadge ? (opts.badge! > 99 ? "99+" : String(opts.badge)) : "";
    const badgeName = opts.badgeLabel ?? (showBadge ? `${opts.badge}` : undefined);
    // Collapsed tooltip carries the label and, when present, the warning text too.
    const collapsedTitle = collapsed ? (opts.warn ? `${label} — ${opts.warn}` : label) : undefined;
    return ready ? (
      <Link
        href={href}
        className={`nav-item${href === activeHref ? " active" : ""}`}
        title={collapsedTitle}
        aria-current={href === activeHref ? "page" : undefined}
      >
        <Icon strokeWidth={1.6} />
        <span className="label">{label}</span>
        {opts.warn && (
          <span className="nav-warn" role="img" aria-label={opts.warn}>
            <AlertTriangle strokeWidth={1.9} />
            <span className="nav-warn-tip" aria-hidden>{opts.warn}</span>
          </span>
        )}
        {opts.locked && <span className="nav-lock" title="Set by DPO/CISO"><Lock strokeWidth={1.7} /></span>}
        {showBadge && <span className="count" aria-label={badgeName}>{badgeText}</span>}
      </Link>
    ) : (
      <span className="nav-item disabled" title={label}>
        <Icon strokeWidth={1.6} />
        <span className="label">{label}</span>
      </span>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const hasChildren = (group.children?.length ?? 0) > 0;
    if (!hasChildren) {
      const Icon = GROUP_ICON[group.key] ?? childIcon(group.label);
      return <div key={group.key}>{renderItem(group.href, group.label, Icon, group.ready, { badge: group.badge, badgeLabel: group.badgeLabel, warn: group.warn, locked: group.locked })}</div>;
    }
    // When collapsed, every group renders open (headers are hidden by CSS).
    const isOpen = collapsed ? true : open[group.key] ?? false;
    // Badge migration: a closed section shows the section total; when open, the
    // total lives on the page rows instead.
    const childTotal = (group.children ?? []).reduce((n, c) => n + (c.badge ?? 0), 0);
    const headerBadge = group.badge ?? (childTotal > 0 ? childTotal : undefined);
    const headerWarn = group.warn ?? (group.children ?? []).find((c) => c.warn)?.warn ?? null;
    const headerBadgeText = headerBadge !== undefined ? (headerBadge > 99 ? "99+" : String(headerBadge)) : "";
    return (
      <div key={group.key} className={`nav-group${isOpen ? "" : " closed"}`}>
        <button type="button" className="nav-group-header" aria-expanded={isOpen} onClick={() => toggle(group.key)}>
          <span className="label">{group.label}</span>
          {!isOpen && headerWarn && <span className="nav-warn" role="img" aria-label={headerWarn}><AlertTriangle strokeWidth={1.9} /></span>}
          {!isOpen && headerBadge !== undefined && headerBadge > 0 && <span className="count" aria-label={`${headerBadge} items need attention`}>{headerBadgeText}</span>}
          <ChevronUp strokeWidth={1.6} />
        </button>
        <div className="nav-group-items">
          {(group.children ?? []).map((child) =>
            child.heading !== undefined ? null : (
              <div key={child.href}>{renderItem(child.href, child.label, childIcon(child.label), child.ready, { badge: child.badge, badgeLabel: child.badgeLabel, warn: child.warn })}</div>
            ),
          )}
        </div>
      </div>
    );
  };

  const main = groups.filter((g) => isSection(g) || !g.footer);
  const footer = groups.filter((g): g is NavGroup => !isSection(g) && !!g.footer);

  return (
    <nav className="nav">
      <div className="nav-scroll">
        {main.map((entry) =>
          isSection(entry)
            ? <div key={`sec-${entry.section}`} className="nav-macro" aria-hidden>{entry.section}</div>
            : renderGroup(entry),
        )}
      </div>
      {footer.length > 0 && (
        <div className="nav-footer">
          {footer.map((g) => renderGroup(g))}
        </div>
      )}
    </nav>
  );
}
