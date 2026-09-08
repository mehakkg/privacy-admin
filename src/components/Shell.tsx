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
    // The permanent landing surface — a summary, not a work queue, so it sits
    // above the six sections as its own item.
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      ready: true,
    },

    // Six sections below Dashboard. Each is a page-group; anything deeper than a
    // page is a tab INSIDE that page, never a third sidebar level. Fiduciary
    // management lives as a tab within Processing Activities (its richest detail
    // — Linked Users, SDF status, hierarchy — belongs there); every other screen
    // that needs a Fiduciary reference pulls from that same registry.
    {
      key: "data-map",
      label: "Data Map",
      href: "/discovery/sources",
      ready: true,
      children: [
        { href: "/discovery/sources", label: "Sources", ready: true },
        { href: "/data-map/processing-activities", label: "Processing activities", ready: true },
        { href: "/discovery/inventory", label: "Data inventory", ready: true },
        { href: "/discovery/triage", label: "Review queue", ready: true },
        { href: "/data-flow/map", label: "Data flow", ready: true },
        { href: "/discovery/ropa", label: "ROPA", ready: true },
      ],
    },
    {
      key: "consent",
      label: "Consent & Notices",
      href: "/consent/notices",
      ready: true,
      // Notices leads because DPDP Rule 3 sequences a notice before consent.
      children: [
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/platform", label: "Consent collection", ready: true },
        { href: "/consent/records", label: "Consent records", ready: true },
        // Cookie consent has a materially different feature set (script-blocking,
        // banner config, geo/language) from general consent capture, so it is its
        // own sub-tab rather than folded into Consent collection.
        { href: "/consent/cookies", label: "Cookie consent", ready: true },
      ],
    },
    {
      key: "rights",
      label: "Rights Requests",
      href: "/requests",
      ready: true,
      badge: openRequests,
      children: [
        { href: "/requests", label: "Requests", ready: true },
        { href: "/escalations", label: "Escalations", ready: true },
        { href: "/requests/sla", label: "SLA & routing", ready: true },
      ],
    },
    // Breach Management and Vendor Risk are TOP-LEVEL, not nested under Risk &
    // Compliance: each carries its own statutory clock and penalty exposure
    // (DPDP s.8(5)/(6), the 72-hour Board-notification deadline), so burying them
    // a level deeper would undersell their urgency. They sit in the OPERATE tier,
    // after Rights Requests and before the GOVERN & REVIEW tier.
    {
      key: "breach",
      label: "Breach Management",
      href: "/breach/incidents",
      ready: true,
      children: [
        { href: "/breach/incidents", label: "Incidents", ready: true },
        { href: "/breach/investigation", label: "Investigation", ready: true },
        { href: "/breach/notifications", label: "Notifications & Board reporting", ready: true },
      ],
    },
    {
      key: "tprm",
      label: "Vendor Risk (TPRM)",
      href: "/vendor-risk/register",
      ready: true,
      children: [
        { href: "/vendor-risk/register", label: "Vendor register", ready: true },
        { href: "/vendor-risk/assessments", label: "Assessments", ready: true },
        { href: "/vendor-risk/sub-processor-disclosures", label: "Sub-processor disclosures", ready: true },
      ],
    },
    {
      key: "risk",
      label: "Risk & Compliance",
      href: "/analytics/risk",
      ready: true,
      children: [
        { href: "/analytics/risk", label: "Risk dashboard", ready: true },
        { href: "/data-flow/protection-rules", label: "Protection rules", ready: true },
        { href: "/risk/access-insights", label: "Access insights", ready: true },
        { href: "/risk/assessments", label: "Assessments", ready: true },
        { href: "/audit", label: "Audit & evidence", ready: true },
        { href: "/analytics/reports", label: "Reports", ready: true },
      ],
    },

    // Approved Policy: the one deliberate exception to the six-section rule. It
    // is referenced constantly across nearly every other section, so it sits at
    // the top level rather than nested inside one.
    {
      key: "governance",
      label: "Approved Policy",
      href: "/governance",
      ready: true,
    },

    {
      key: "settings",
      label: "Settings",
      href: "/settings/organization",
      ready: true,
      // Configured once at setup, revisited rarely — so Privacy Roles &
      // Permissions and Sign-in methods live here, not at the top level.
      children: [
        { href: "/settings/organization", label: "Organization", ready: true },
        { href: "/settings/users", label: "Users & roles", ready: true },
        { href: "/integrations/connected-systems", label: "Integrations", ready: true },
        { href: "/notifications/channels", label: "Notifications", ready: true },
      ],
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
