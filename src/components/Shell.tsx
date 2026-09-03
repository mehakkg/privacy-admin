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
    // above the three macro-groups rather than inside Operate.
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      ready: true,
    },
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
        // Ordered by dependency: orient (Overview), surface what's genuinely
        // new (Triage), decide (Classification review), then consult the record
        // it produces (Data inventory). Hygiene and generated output come last.
        { href: "/discovery", label: "Overview", ready: true },
        { href: "/discovery/triage", label: "Triage queue", ready: true },
        { href: "/discovery/review", label: "Classification review", ready: true },
        { href: "/discovery/inventory", label: "Data inventory", ready: true },
        { href: "/discovery/duplicates", label: "Duplicates", ready: true },
        { href: "/discovery/rot", label: "ROT candidates", ready: true },
        { href: "/discovery/ropa", label: "ROPA recommendations", ready: true },
      ],
    },
    {
      key: "consent",
      label: "Consent & Notices",
      href: "/consent/notices",
      ready: true,
      // DPDP Rule 3 requires a notice to precede or accompany a consent request:
      // Notices leads because the law sequences it that way, not for convenience.
      // Consent Platform is the infrastructure the capture channels plug into.
      children: [
        { heading: "Foundation" },
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/platform", label: "Consent platform", ready: true },
        { heading: "Capture channels" },
        { href: "/consent/cookies", label: "Cookie consent", ready: true },
        { href: "/consent/assisted", label: "Assisted collection", ready: true },
      ],
    },
    {
      key: "protection",
      label: "Data Flow & Protection Rules",
      href: "/data-flow/entities",
      ready: true,
      // Entity configuration defines the structure Flow Map's entity filter and
      // per-entity policy depend on — this section's Sources. Flow Map shows what
      // exists, Protection Rules acts on it, Data Integrity verifies it last.
      children: [
        { href: "/data-flow/entities", label: "Entity configuration", ready: true },
        { href: "/data-flow/map", label: "Flow map", ready: true },
        { href: "/data-flow/protection-rules", label: "Protection rules", ready: true },
        { href: "/data-flow/integrity", label: "Data integrity", ready: true },
      ],
    },
    {
      key: "access",
      label: "Identity & Access",
      href: "/access/roles",
      ready: true,
      // RBAC Matrix defines the role templates Provisioning consumes — roles
      // exist before granting. Provisioning precedes Deprovisioning in the access
      // lifecycle; Dormant Accounts is maintenance, relevant only later.
      children: [
        { href: "/access/roles", label: "RBAC matrix", ready: true },
        { href: "/access/provisioning", label: "Provisioning", ready: true },
        { href: "/access/deprovisioning", label: "Deprovisioning", ready: true },
        { href: "/access/dormant", label: "Dormant accounts", ready: true },
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
    {
      key: "notifications",
      label: "Notifications",
      href: "/notifications/channels",
      ready: true,
      children: [
        { href: "/notifications/channels", label: "Channels", ready: true },
        { href: "/notifications/templates", label: "Templates", ready: true },
        { href: "/notifications/routing", label: "Routing", ready: true },
      ],
    },
    {
      key: "platform",
      label: "Platform Settings",
      href: "/platform/sign-in",
      ready: true,
      // Sign-in methods (how anyone gets in at all) is most security-critical,
      // then API keys (an extension of who/what can access), then Branding, last
      // as the purely cosmetic item.
      children: [
        { href: "/platform/sign-in", label: "Sign-in methods", ready: true },
        { href: "/platform/api-keys", label: "API keys", ready: true },
        { href: "/platform/branding", label: "Branding", ready: true },
      ],
    },
    // Oversight, evidence, reference — pulled from, not executed into. Approved
    // Policy leads as the rules everything else is measured against; Audit is the
    // evidence layer; Analytics scores posture against those rules; User Directory
    // is a standalone lookup, dependent on neither, so it's last.
    { section: "Govern & Review" },
    {
      key: "governance",
      label: "Approved Policy",
      href: "/governance",
      ready: true,
    },
    {
      key: "audit",
      label: "Audit & Compliance",
      href: "/audit",
      ready: true,
      // Alert-first (Policy Violation Dashboard) → raw detail (Unified Log
      // Search) → compiled output (Evidence Compiler): orientation, then depth.
      children: [
        { href: "/audit/violations", label: "Policy violation dashboard", ready: true },
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
      key: "directory",
      label: "User Directory",
      href: "/directory",
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
