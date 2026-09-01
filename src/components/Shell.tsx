import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { requireOnboardingGate } from "@/lib/guards/onboardingGate";
import { ROLE_LABEL } from "@/lib/domain";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarNav, type NavGroup } from "@/components/SidebarNav";

/**
 * Admin module navigation.
 *
 * Groups mirror the module's information architecture. Sub-items that are not
 * built in this pass are listed but inert, so the shape of the module stays
 * legible without pretending the screens exist.
 */
function navGroups(openRequests: number): NavGroup[] {
  return [
    {
      key: "requests",
      label: "Requests",
      href: "/requests",
      ready: true,
      badge: openRequests,
      children: [
        { href: "/requests", label: "All", ready: true },
        { href: "/requests?source=grievance_officer", label: "From Grievance Officer", ready: true },
        { href: "/requests?source=dpb", label: "From the Board", ready: true },
        { href: "/requests?assigned=me", label: "My assigned", ready: false },
      ],
    },
    {
      key: "discovery",
      label: "Data Discovery & Classification",
      href: "/discovery",
      ready: true,
      children: [
        { href: "/discovery/triage", label: "Triage queue", ready: true },
        { href: "/discovery/inventory", label: "Data inventory", ready: true },
        { href: "/discovery/review", label: "Classification review", ready: true },
        { href: "/discovery/duplicates", label: "Duplicates", ready: true },
        { href: "/discovery/rot", label: "ROT candidates", ready: true },
        { href: "/discovery/import", label: "Bulk import", ready: true },
      ],
    },
    {
      key: "consent",
      label: "Consent & Notices",
      href: "/consent",
      ready: false,
      children: [
        { href: "/consent/cookies", label: "Cookie consent", ready: false },
        { href: "/consent/notices", label: "Notices", ready: false },
        { href: "/consent/platform", label: "Consent platform", ready: false },
        { href: "/consent/assisted", label: "Assisted collection", ready: false },
      ],
    },
    {
      key: "protection",
      label: "Data Flow & Protection Rules",
      href: "/protection",
      ready: false,
      children: [
        { href: "/protection/flow", label: "Flow map", ready: false },
        { href: "/protection/rules", label: "Protection rules", ready: false },
        { href: "/protection/entities", label: "Entity configuration", ready: false },
      ],
    },
    {
      key: "access",
      label: "Identity & Access",
      href: "/access/provisioning",
      ready: true,
      children: [
        { href: "/access/provisioning", label: "Provisioning", ready: true },
        { href: "/access/deprovisioning", label: "Deprovisioning", ready: true },
        { href: "/access/verification", label: "Revocation verification", ready: true },
        { href: "/access/dormant", label: "Dormant accounts", ready: true },
        { href: "/access/roles", label: "RBAC matrix", ready: true },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      href: "/integrations",
      ready: false,
      children: [
        { href: "/integrations/systems", label: "Connected systems", ready: false },
        { href: "/integrations/processors", label: "Data processors", ready: false },
        { href: "/integrations/health", label: "Health monitoring", ready: false },
      ],
    },
    {
      key: "escalations",
      label: "Escalations",
      href: "/escalations",
      ready: true,
      children: [
        { href: "/escalations?status=open", label: "Open", ready: true },
        { href: "/escalations?status=ruled", label: "Ruled", ready: true },
        { href: "/escalations?status=closed", label: "Closed", ready: true },
      ],
    },
    {
      key: "audit",
      label: "Audit & Compliance",
      href: "/audit",
      ready: true,
      children: [
        { href: "/audit", label: "Unified log search", ready: true },
        { href: "/audit/evidence", label: "Evidence compiler", ready: false },
      ],
    },
    {
      key: "analytics",
      label: "Analytics",
      href: "/analytics",
      ready: false,
      children: [
        { href: "/analytics/risk", label: "Risk dashboard", ready: false },
      ],
    },
    {
      key: "governance",
      label: "Approved Policy",
      href: "/governance",
      ready: true,
    },
    {
      key: "onboarding",
      label: "Guided setup",
      href: "/onboarding",
      ready: true,
    },
  ];
}

export async function Shell({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: ReactNode;
}) {
  // Single chokepoint for the onboarding gate. Every page in the module renders
  // through Shell, so guarding here covers all of them without each route
  // remembering to. The wizard itself is the one exemption — guarding it would
  // redirect it to itself.
  if (!active.startsWith("/onboarding")) {
    await requireOnboardingGate();
  }

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
        <SidebarNav groups={navGroups(openRequests)} active={active} />
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
          <ThemeToggle />
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
