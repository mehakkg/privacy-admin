"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, Search, Bell, Settings } from "lucide-react";
import { SidebarNav, type NavEntry } from "@/components/SidebarNav";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ProductSwitcher } from "@/components/shell/ProductSwitcher";
import { ActingAsSwitcher } from "@/components/shell/ActingAsSwitcher";
import type { ActorRole } from "@/lib/domain";

const COLLAPSE_KEY = "privacy-admin.sidebar.collapsed";

/**
 * The app shell frame. Owns the sidebar-collapse state so the header hamburger
 * and the sidebar share it. The product identity now lives entirely in the
 * header switcher — the sidebar has no brand block and starts straight at the
 * nav (switcher-revision §4.1). Header order (§4.8):
 *   [≡] [Switcher] … [Search] [Acting as ▾] [🔔] [⚙] [Avatar]
 */
export function ShellFrame({
  nav,
  active,
  initials,
  name,
  email,
  signedInName,
  signedInEmail,
  currentRole,
  unread,
  children,
}: {
  nav: NavEntry[];
  active: string;
  initials: string;
  name: string;
  email: string;
  signedInName: string;
  signedInEmail: string;
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
        <SidebarNav groups={nav} active={active} collapsed={collapsed} />
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="icon-btn" onClick={toggle} aria-label="Toggle sidebar">
              <Menu strokeWidth={1.7} />
            </button>
            <ProductSwitcher role={currentRole} />
          </div>
          <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="shell-search" aria-label="Search" title="Search across products">
              <Search size={15} strokeWidth={1.8} />
              <span className="shell-search-text">Search</span>
            </button>
            <ActingAsSwitcher role={currentRole} />
            <Link href="/notifications" className="icon-btn shell-bell" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications">
              <Bell strokeWidth={1.7} />
              {unread > 0 && <span className="shell-bell-dot" aria-hidden />}
            </Link>
            <a href="/settings/organization" className="icon-btn" aria-label="Settings" title="Settings"><Settings strokeWidth={1.7} /></a>
            <ProfileMenu initials={initials} name={name} email={email} signedInName={signedInName} signedInEmail={signedInEmail} currentRole={currentRole} unread={unread} />
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
