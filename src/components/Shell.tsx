import type { ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { requireOnboardingGate } from "@/lib/guards/onboardingGate";
import { ROLE_LABEL } from "@/lib/domain";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SidebarNav, type NavEntry } from "@/components/SidebarNav";

/**
 * Admin module navigation.
 *
 * Groups mirror the module's information architecture. Sub-items that are not
 * built in this pass are listed but inert, so the shape of the module stays
 * legible without pretending the screens exist.
 */
function navGroups(openRequests: number): NavEntry[] {
  return [
    // Daily, deadline-bound work.
    { section: "Operate" },
    {
      key: "requests",
      label: "Requests",
      href: "/requests",
      ready: true,
      badge: openRequests,
    },
    {
      key: "escalations",
      label: "Escalations",
      href: "/escalations",
      ready: true,
    },
    // Setup and ongoing technical maintenance.
    { section: "Configure" },
    {
      key: "discovery",
      label: "Data Discovery & Classification",
      href: "/discovery",
      ready: true,
      // Two groups, in the order the work actually happens: connect data
      // before reviewing it. Everything under Review & Classify is downstream
      // of at least one source existing.
      children: [
        { heading: "Add data" },
        { href: "/discovery/sources", label: "Sources", ready: true },
        { href: "/discovery/import", label: "Add processing activity", ready: true },
        { heading: "Review & classify" },
        { href: "/discovery", label: "Overview", ready: true },
        { href: "/discovery/triage", label: "Triage queue", ready: true },
        { href: "/discovery/inventory", label: "Data inventory", ready: true },
        { href: "/discovery/review", label: "Classification review", ready: true },
        { href: "/discovery/duplicates", label: "Duplicates", ready: true },
        { href: "/discovery/rot", label: "ROT candidates", ready: true },
      ],
    },
    {
      key: "consent",
      label: "Consent & Notices",
      href: "/consent/notices",
      ready: true,
      children: [
        { href: "/consent/cookies", label: "Cookie consent", ready: true },
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/platform", label: "Consent platform", ready: true },
        { href: "/consent/assisted", label: "Assisted collection", ready: true },
      ],
    },
    {
      key: "protection",
      label: "Data Flow & Protection Rules",
      href: "/data-flow/map",
      ready: true,
      children: [
        { href: "/data-flow/map", label: "Flow map", ready: true },
        { href: "/data-flow/protection-rules", label: "Protection rules", ready: true },
        { href: "/data-flow/entities", label: "Entity configuration", ready: true },
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
        { href: "/access/dormant", label: "Dormant accounts", ready: true },
        { href: "/access/roles", label: "RBAC matrix", ready: true },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      href: "/integrations/connected-systems",
      ready: true,
      children: [
        { href: "/integrations/connected-systems", label: "Connected systems", ready: true },
        { href: "/integrations/data-processors", label: "Data processors", ready: true },
        { href: "/integrations/health-monitoring", label: "Health monitoring", ready: true },
      ],
    },
    // Oversight, evidence, reference — pulled from, not executed into.
    { section: "Govern & Review" },
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
      href: "/analytics/risk",
      ready: true,
    },
    {
      key: "governance",
      label: "Approved Policy",
      href: "/governance",
      ready: true,
    },
  ];
}

/**
 * "R. Iyer" -> "RI", "P. Deshmukh" -> "PD". Takes the first letter of each
 * word, so an initialled first name contributes its initial rather than a
 * stray full stop.
 */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z]/g, "").charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
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
          <Link
            href="/notifications"
            className="icon-btn"
            aria-label={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
            title={unread > 0 ? `${unread} unread` : "Notifications"}
          >
            <Bell size={16} strokeWidth={1.9} />
            {unread > 0 && (
              <span className="icon-badge">{unread > 9 ? "9+" : unread}</span>
            )}
          </Link>
          <ThemeToggle />
          <RoleSwitcher current={session.role} />
          <ProfileMenu
            initials={initialsOf(session.actor.label)}
            name={session.actor.label}
            role={ROLE_LABEL[session.role]}
          />
        </header>
        <main className="main-body">{children}</main>
      </div>
    </div>
  );
}
