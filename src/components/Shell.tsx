import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { ROLE_LABEL } from "@/lib/domain";
import { RoleSwitcher } from "@/components/RoleSwitcher";

/**
 * Admin module navigation.
 *
 * The seven top-level areas are the information architecture from the spec.
 * Only Requests, Audit & Compliance and the governance views are built in this
 * pass; the rest are shown but inert, so the shape of the module is legible
 * without pretending the screens exist.
 */
const NAV: {
  section: string;
  items: { href: string; label: string; ready: boolean }[];
}[] = [
  {
    section: "Execute",
    items: [
      { href: "/requests", label: "Requests", ready: true },
      { href: "/discovery", label: "Data Discovery & Classification", ready: false },
      { href: "/consent", label: "Consent & Notices", ready: false },
      { href: "/protection", label: "Data Flow & Protection Rules", ready: false },
    ],
  },
  {
    section: "Administer",
    items: [
      { href: "/access/provisioning", label: "Identity & Access", ready: true },
      { href: "/integrations", label: "Integrations", ready: false },
      { href: "/escalations", label: "Escalations", ready: true },
    ],
  },
  {
    section: "Evidence",
    items: [
      { href: "/audit", label: "Audit & Compliance", ready: true },
      { href: "/analytics", label: "Analytics", ready: false },
      { href: "/governance", label: "Approved Policy", ready: true },
    ],
  },
  {
    section: "Setup",
    items: [{ href: "/onboarding", label: "Guided setup", ready: true }],
  },
];

export async function Shell({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: ReactNode;
}) {
  const session = await getSession();
  const [openRequests, unread] = await Promise.all([
    db.dataPrincipalRequest.count({
      where: { status: { notIn: ["closed", "rejected"] } },
    }),
    countUnread(session.role),
  ]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">P</div>
          <div className="sidebar-logo-words">
            <span className="sidebar-logo-name">Privacy Admin</span>
            <span className="sidebar-logo-sub">DPDP compliance</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="sidebar-section-label">{group.section}</div>
              {group.items.map((item) =>
                item.ready ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-item ${
                      active === item.href || item.href.startsWith(`${active}/`)
                        ? "active"
                        : ""
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.href === "/requests" && (
                      <span className="count">{openRequests}</span>
                    )}
                  </Link>
                ) : (
                  <div
                    key={item.href}
                    className="sidebar-item disabled"
                    title="Not built in this pass"
                  >
                    <span>{item.label}</span>
                  </div>
                ),
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <span className="topbar-spacer" />
          <Link href="/notifications" className="btn sm ghost">
            Notifications
            {unread > 0 && (
              <span className="pill red" style={{ marginLeft: 4 }}>
                <span className="dot" />
                {unread}
              </span>
            )}
          </Link>
          <RoleSwitcher current={session.role} />
          <span className="cell-sub">
            {session.actor.label} · {ROLE_LABEL[session.role]}
          </span>
        </header>
        <main className="main-body">{children}</main>
      </div>
    </div>
  );
}
