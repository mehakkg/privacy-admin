"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileCheck2,
  Inbox,
  Plug,
  Rocket,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Two collapse behaviours, deliberately kept separate:
 *
 *   GROUP disclosure — each nav group opens and closes independently, and more
 *   than one can be open. On load only the group containing the current page is
 *   open, which is what keeps the sidebar scannable: showing every sub-item of
 *   every group at once is the density problem, not a feature.
 *
 *   RAIL collapse — shrinks the whole sidebar to icons. Sub-items are not
 *   squeezed in; clicking a group icon opens a FLYOUT beside the rail, so Admin
 *   can navigate without giving up the horizontal space. Expanding the rail to
 *   reach a sub-item would make the collapse pointless for anyone who actually
 *   uses it.
 *
 * The rail preference persists per browser; group state does not, because the
 * right default depends on where you are, and that changes every navigation.
 */

const ICONS: Record<string, LucideIcon> = {
  requests: Inbox,
  discovery: ScanSearch,
  consent: FileCheck2,
  protection: Workflow,
  access: UserCog,
  integrations: Plug,
  escalations: TriangleAlert,
  audit: ClipboardCheck,
  analytics: BarChart3,
  governance: ShieldCheck,
  onboarding: Rocket,
};

/**
 * A sub-item, or a heading that divides a long child list into labelled groups.
 * A group with nine children reads as an undifferentiated list; two labelled
 * runs of three and six read as a sequence.
 */
export type NavChild =
  | { href: string; label: string; ready: boolean; heading?: never }
  | { heading: string; href?: never; label?: never; ready?: never };

export interface NavGroup {
  key: string;
  label: string;
  href: string;
  ready: boolean;
  /** Shown on the group row itself, e.g. the open-request count. */
  badge?: number;
  children?: NavChild[];
}

const STORAGE_KEY = "privacy-admin.sidebar.collapsed";

function groupOwnsPath(group: NavGroup, path: string): boolean {
  if (path === group.href || path.startsWith(`${group.href}/`)) return true;
  return (group.children ?? []).some(
    (c) => c.href !== undefined && (path === c.href || path.startsWith(`${c.href}/`)),
  );
}

export function SidebarNav({
  groups,
  active,
}: {
  groups: NavGroup[];
  active: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);

  // Only the group owning the current page starts open.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) initial[g.key] = groupOwnsPath(g, active);
    return initial;
  });

  // Read the stored preference after mount. Rendering expanded first and
  // correcting on hydration would shift the layout on every page load, so the
  // rail only animates once we know the real value.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private browsing, blocked storage — expanded is a fine default.
    }
    setHydrated(true);
  }, []);

  // Keep the active group open as the route changes.
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) if (groupOwnsPath(g, active)) next[g.key] = true;
      return next;
    });
    setFlyout(null);
  }, [active, groups]);

  const toggleRail = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference simply will not persist; navigation still works.
      }
      return next;
    });
    setFlyout(null);
  };

  return (
    <nav
      className={`sidebar-nav${collapsed ? " rail" : ""}${hydrated ? "" : " preload"}`}
      onMouseLeave={() => setFlyout(null)}
    >
      <div className="sidebar-nav-items">
        {groups.map((group) => {
          const Icon = ICONS[group.key] ?? Inbox;
          const owns = groupOwnsPath(group, active);
          const isOpen = open[group.key] ?? false;
          const hasChildren = (group.children?.length ?? 0) > 0;

          if (collapsed) {
            return (
              <div key={group.key} className="rail-item-wrap">
                <button
                  type="button"
                  className={`sidebar-item rail-item${owns ? " active" : ""}${group.ready ? "" : " disabled"}`}
                  aria-label={group.label}
                  onClick={() => {
                    if (hasChildren) {
                      setFlyout((f) => (f === group.key ? null : group.key));
                    } else if (group.ready) {
                      window.location.href = group.href;
                    }
                  }}
                  onMouseEnter={() => hasChildren && setFlyout(group.key)}
                >
                  <Icon size={17} strokeWidth={1.9} />
                  {group.badge !== undefined && (
                    <span className="rail-badge">{group.badge}</span>
                  )}
                </button>

                {/* Tooltip for groups with nothing to fly out. */}
                {!hasChildren && <span className="rail-tip">{group.label}</span>}

                {hasChildren && flyout === group.key && (
                  <div className="rail-flyout">
                    <div className="rail-flyout-head">{group.label}</div>
                    {group.ready && (
                      <Link href={group.href} className="sidebar-subitem">
                        Overview
                      </Link>
                    )}
                    {(group.children ?? []).map((child, ci) =>
                      child.heading !== undefined ? (
                        <div key={`h${ci}`} className="sidebar-subheading">{child.heading}</div>
                      ) :
                      child.ready ? (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`sidebar-subitem${active === child.href ? " active" : ""}`}
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <span
                          key={child.href}
                          className="sidebar-subitem disabled"
                          title="Not built in this pass"
                        >
                          {child.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={group.key}>
              <div className={`sidebar-item${owns ? " active" : ""}${group.ready || hasChildren ? "" : " disabled"}`}>
                {group.ready ? (
                  <Link href={group.href} className="sidebar-item-main">
                    <Icon size={16} strokeWidth={1.9} />
                    <span>{group.label}</span>
                  </Link>
                ) : (
                  <span className="sidebar-item-main" title="Not built in this pass">
                    <Icon size={16} strokeWidth={1.9} />
                    <span>{group.label}</span>
                  </span>
                )}

                {group.badge !== undefined && (
                  <span className="count">{group.badge}</span>
                )}

                {hasChildren && (
                  <button
                    type="button"
                    className="sidebar-chevron"
                    aria-label={isOpen ? `Collapse ${group.label}` : `Expand ${group.label}`}
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((o) => ({ ...o, [group.key]: !o[group.key] }))
                    }
                  >
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                )}
              </div>

              {hasChildren && isOpen && (
                <div className="sidebar-subnav">
                  {(group.children ?? []).map((child, ci) =>
                      child.heading !== undefined ? (
                        <div key={`h${ci}`} className="sidebar-subheading">{child.heading}</div>
                      ) :
                    child.ready ? (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`sidebar-subitem${active === child.href ? " active" : ""}`}
                      >
                        {child.label}
                      </Link>
                    ) : (
                      <span
                        key={child.href}
                        className="sidebar-subitem disabled"
                        title="Not built in this pass"
                      >
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
