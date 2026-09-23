"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import { SidebarNav, type NavEntry } from "@/components/SidebarNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import type { ActorRole } from "@/lib/domain";

const COLLAPSE_KEY = "privacy-admin.sidebar.collapsed";

/**
 * The app shell frame (app-shell-ui-spec). Owns the sidebar-collapse state so the
 * header hamburger and the sidebar share it. Renders the navy sidebar (brand +
 * nav), the two-control header (hamburger + avatar), and the white page canvas —
 * the only scroll container. Content, nav config and handlers are unchanged.
 */
export function ShellFrame({
  nav,
  active,
  brandName,
  brandCaption,
  initials,
  name,
  email,
  currentRole,
  unread,
  children,
}: {
  nav: NavEntry[];
  active: string;
  brandName: string;
  brandCaption: string;
  initials: string;
  name: string;
  email: string;
  currentRole: ActorRole;
  unread: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* fine */ }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* fine */ }
      return next;
    });

  return (
    <div className="app">
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="brand">
          <span className="mark"><ShieldCheck strokeWidth={2} /></span>
          <div className="txt">
            <span className="name">{brandName}</span>
            <span className="caption">{brandCaption}</span>
          </div>
        </div>
        <SidebarNav groups={nav} active={active} collapsed={collapsed} />
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={toggle} aria-label="Toggle sidebar">
              <Menu strokeWidth={1.7} />
            </button>
          </div>
          <div className="topbar-right">
            <ProfileMenu initials={initials} name={name} email={email} currentRole={currentRole} unread={unread} />
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
