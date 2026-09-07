"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Inbox,
  LayoutDashboard,
  Map,
  Plug,
  Rocket,
  ScanSearch,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  UserCog,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * GROUP disclosure — each group with sub-items opens and closes independently;
 * clicking anywhere on the group row toggles it. RAIL collapse — shrinks the
 * whole sidebar (logo included) to an icon rail; a group's icon opens a flyout.
 *
 * Exactly one destination is highlighted at a time: the deepest route that
 * matches the current URL. A parent group is never highlighted — only the
 * sub-item you are actually on.
 */

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  "data-map": Map,
  consent: FileCheck2,
  rights: Inbox,
  risk: Gauge,
  governance: ShieldCheck,
  settings: Settings,
  // retained keys still used by individual pages / fallbacks
  fiduciaries: Building2,
  requests: Inbox,
  discovery: ScanSearch,
  protection: Workflow,
  access: UserCog,
  integrations: Plug,
  notifications: Bell,
  platform: Settings,
  escalations: TriangleAlert,
  audit: ClipboardCheck,
  analytics: BarChart3,
  directory: Users,
  onboarding: Rocket,
};

export type NavChild =
  | { href: string; label: string; ready: boolean; heading?: never }
  | { heading: string; href?: never; label?: never; ready?: never };

export interface NavGroup {
  key: string;
  label: string;
  href: string;
  ready: boolean;
  badge?: number;
  children?: NavChild[];
}

export type NavSection = { section: string };
export type NavEntry = NavSection | NavGroup;
function isSection(e: NavEntry): e is NavSection {
  return (e as NavSection).section !== undefined;
}

const STORAGE_KEY = "privacy-admin.sidebar.collapsed";

function matches(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

export function SidebarNav({
  groups,
  active,
}: {
  groups: NavEntry[];
  active: string;
}) {
  const pathname = usePathname() || active;
  const navRef = useRef<HTMLElement>(null);

  // The single active destination: among every leaf item and every sub-item,
  // the one whose href is the LONGEST prefix of the current path. This makes
  // exactly one row light up — a sub-item, never its parent group.
  const candidates: string[] = [];
  for (const g of groups) {
    if (isSection(g)) continue;
    if (g.children?.length) {
      for (const c of g.children) if (c.href) candidates.push(c.href);
    } else {
      candidates.push(g.href);
    }
  }
  let activeHref: string | null = null;
  for (const href of candidates) {
    if (matches(pathname, href) && (activeHref === null || href.length > activeHref.length)) {
      activeHref = href;
    }
  }

  const groupOwnsActive = (g: NavGroup): boolean =>
    g.children?.length
      ? g.children.some((c) => c.href !== undefined && c.href === activeHref)
      : g.href === activeHref;

  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);

  // Only the group owning the current page starts open.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) if (!isSection(g)) initial[g.key] = groupOwnsActive(g);
    return initial;
  });

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* blocked storage — expanded is a fine default */
    }
    setHydrated(true);
  }, []);

  // Reflect the collapse state onto the whole sidebar so the logo and width
  // respond, not just the nav list. (The logo lives in the parent <aside>.)
  useEffect(() => {
    const aside = navRef.current?.closest(".sidebar");
    if (aside) aside.setAttribute("data-rail", collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  // Keep the active group open as the route changes.
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) if (!isSection(g) && groupOwnsActive(g)) next[g.key] = true;
      return next;
    });
    setFlyout(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleRail = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* preference just won't persist */
      }
      return next;
    });
    setFlyout(null);
  };

  return (
    <nav
      ref={navRef}
      className={`sidebar-nav${collapsed ? " rail" : ""}${hydrated ? "" : " preload"}`}
      onMouseLeave={() => setFlyout(null)}
    >
      <div className="sidebar-nav-items">
        {groups.map((entry, ei) => {
          if (isSection(entry)) {
            return collapsed ? (
              <div key={`s${ei}`} className="sidebar-rail-divider" aria-hidden />
            ) : (
              <div key={`s${ei}`} className="sidebar-section-label">{entry.section}</div>
            );
          }
          const group = entry;
          const Icon = ICONS[group.key] ?? Inbox;
          const hasChildren = (group.children?.length ?? 0) > 0;
          const isOpen = open[group.key] ?? false;
          const owns = groupOwnsActive(group);

          // ---- Collapsed rail ----
          if (collapsed) {
            return (
              <div key={group.key} className="rail-item-wrap">
                <button
                  type="button"
                  className={`sidebar-item rail-item${owns ? " active" : ""}${group.ready ? "" : " disabled"}`}
                  aria-label={group.label}
                  onClick={() => {
                    if (hasChildren) setFlyout((f) => (f === group.key ? null : group.key));
                    else if (group.ready) window.location.href = group.href;
                  }}
                  onMouseEnter={() => hasChildren && setFlyout(group.key)}
                >
                  <Icon size={17} strokeWidth={1.9} />
                  {group.badge !== undefined && <span className="rail-badge">{group.badge}</span>}
                </button>

                {!hasChildren && <span className="rail-tip">{group.label}</span>}

                {hasChildren && flyout === group.key && (
                  <div className="rail-flyout">
                    <div className="rail-flyout-head">{group.label}</div>
                    {(group.children ?? []).map((child, ci) =>
                      child.heading !== undefined ? (
                        <div key={`h${ci}`} className="sidebar-subheading">{child.heading}</div>
                      ) : child.ready ? (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`sidebar-subitem${child.href === activeHref ? " active" : ""}`}
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <span key={child.href} className="sidebar-subitem disabled" title="Not built yet">
                          {child.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          }

          // ---- Expanded: leaf item (no children) — navigates, highlights ----
          if (!hasChildren) {
            const activeLeaf = group.href === activeHref;
            return (
              <div key={group.key}>
                {group.ready ? (
                  <Link href={group.href} className={`sidebar-item${activeLeaf ? " active" : ""}`}>
                    <Icon size={16} strokeWidth={1.9} />
                    <span className="sidebar-label">{group.label}</span>
                    {group.badge !== undefined && <span className="count">{group.badge}</span>}
                  </Link>
                ) : (
                  <span className="sidebar-item disabled" title="Not built yet">
                    <Icon size={16} strokeWidth={1.9} />
                    <span className="sidebar-label">{group.label}</span>
                  </span>
                )}
              </div>
            );
          }

          // ---- Expanded: group with sub-items — whole row toggles open ----
          return (
            <div key={group.key}>
              <button
                type="button"
                className="sidebar-item sidebar-grouprow"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [group.key]: !o[group.key] }))}
              >
                <Icon size={16} strokeWidth={1.9} />
                <span className="sidebar-label">{group.label}</span>
                {group.badge !== undefined && <span className="count">{group.badge}</span>}
                <span className={`sidebar-chevron${isOpen ? " open" : ""}`}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="sidebar-subnav">
                  {(group.children ?? []).map((child, ci) =>
                    child.heading !== undefined ? (
                      <div key={`h${ci}`} className="sidebar-subheading">{child.heading}</div>
                    ) : child.ready ? (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`sidebar-subitem${child.href === activeHref ? " active" : ""}`}
                      >
                        {child.label}
                      </Link>
                    ) : (
                      <span key={child.href} className="sidebar-subitem disabled" title="Not built yet">
                        {child.label}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="sidebar-collapse" onClick={toggleRail}>
        {collapsed ? (
          <ChevronsRight size={14} />
        ) : (
          <>
            <ChevronsLeft size={14} />
            <span>Collapse</span>
          </>
        )}
      </button>
    </nav>
  );
}
