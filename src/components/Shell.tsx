import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { requireOnboardingGate } from "@/lib/guards/onboardingGate";
import { ShellFrame } from "@/components/ShellFrame";
import { type NavEntry } from "@/components/SidebarNav";
import type { ActorRole } from "@/lib/domain";

/**
 * Admin module navigation — organised into three macro groups by dependency
 * (see the nav revision spec):
 *
 *   CONFIGURE — foundations that must exist before anything operates.
 *   OPERATE   — live queues with statutory clocks.
 *   GOVERN AND REVIEW — oversight, evidence and policy.
 *
 * Macro labels are non-interactive overline text. Two levels only: a section is
 * level 1, a page is level 2; anything deeper is a tab inside the page, never a
 * third nav level. Moving a page here never changes its URL (see the redirect
 * stubs); only its position changes.
 */
interface NavCounts {
  openRequests: number;
  auditOpen: number;
  maskingPending: number;
}

function navGroups(counts: NavCounts, role: ActorRole): NavEntry[] {
  return [
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      ready: true,
    },
    // Legal/Procurement's dedicated home — role-scoped, appears only while acting
    // as Legal. Not part of the macro structure; unmapped by the nav spec.
    ...(role === "legal"
      ? [{ key: "tprm-dashboard", label: "TPRM Dashboard", href: "/tprm", ready: true } as NavEntry]
      : []),

    // ---- CONFIGURE: foundations that must exist before anything operates. ----
    { section: "Configure" },
    {
      key: "data-map",
      label: "Data Map",
      href: "/data-map/sources",
      ready: true,
      // Fiduciaries, scan config, categories, quarantine and identity resolution
      // are now tabs inside these six pages; their routes stay live for deep links.
      children: [
        { href: "/data-map/sources", label: "Sources", ready: true },
        { href: "/data-map/processing-activities", label: "Processing activities", ready: true },
        { href: "/discovery/inventory", label: "Data inventory", ready: true },
        { href: "/discovery/triage", label: "Review queue", ready: true },
        { href: "/data-flow/map", label: "Data flow", ready: true },
        { href: "/discovery/ropa", label: "ROPA", ready: true },
      ],
    },
    // NEW SECTION — Data Protection groups the Rule 6(1)(a) safeguards (masking,
    // protection rules, scope adjustments, and later encryption/keys). They share
    // one ownership model (CISO/DPO defines, Admin implements, governed changes
    // need approval), so they share one section. It sits directly under Data Map
    // because it consumes Data Map's output (masking fields link to data elements,
    // protection rules scope to data categories).
    {
      key: "data-protection",
      label: "Data Protection",
      href: "/data-flow/protection-rules",
      ready: true,
      // One page, four tabs (By field · By rule · Library · Pending changes).
      // Masking is a METHOD on a rule, not a separate page; the former Masking
      // policy, Scope adjustments and Rule library are now tabs. The pending-
      // approval badge (DPO only) sits on this page.
      children: [
        { href: "/data-flow/protection-rules", label: "Protection rules", ready: true, badge: role === "dpo" ? counts.maskingPending : undefined },
      ],
    },
    {
      key: "consent",
      label: "Consent & Notices",
      href: "/consent/notices",
      ready: true,
      // Cookie consent, offline/assisted capture, integrity, language variants,
      // withdrawals etc. are now tabs inside these three pages; routes stay live.
      children: [
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/platform", label: "Consent collection", ready: true },
        { href: "/consent/records", label: "Consent records", ready: true },
      ],
    },

    // ---- OPERATE: live queues with statutory clocks. ----
    { section: "Operate" },
    {
      key: "rights",
      label: "Rights Requests",
      href: "/requests",
      ready: true,
      badge: counts.openRequests,
      children: [
        { href: "/requests", label: "Requests", ready: true },
        { href: "/escalations", label: "Escalations", ready: true },
        // The execution leg of a deletion request (s.8(7) erasure, incl. at
        // processors) — moved here from Audit & Escalation. Route unchanged.
        { href: "/audit-trail/deletions", label: "Deletion instructions", ready: true },
        { href: "/requests/sla", label: "SLA & routing", ready: true },
      ],
    },
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
        { href: "/vendor-risk/assessments", label: "Vendor assessments", ready: true },
        { href: "/vendor-risk/sub-processor-disclosures", label: "Sub-processor disclosures", ready: true },
      ],
    },

    // ---- GOVERN AND REVIEW: oversight, evidence and policy. ----
    { section: "Govern and review" },
    // Approved Policy is a top-level page (the one deliberate exception to
    // "sections contain pages"): six other modules route users to it. For Admin
    // it shows a lock — it is set by the DPO/CISO — but stays visible and readable.
    {
      key: "governance",
      label: "Approved Policy",
      href: "/governance",
      ready: true,
      locked: role !== "dpo" && role !== "ciso",
    },
    {
      key: "risk",
      label: "Risk & Compliance",
      href: "/analytics/risk",
      ready: true,
      // Configuration screens (protection rules, scope adjustments, libraries)
      // moved to Data Protection; this section is now review-only. Assessments
      // here means DPIA + gap assessments (DPO-owned; Admin read-only).
      children: [
        { href: "/analytics/risk", label: "Risk dashboard", ready: true },
        { href: "/analytics/risk-sources", label: "Risk analytics sources", ready: true },
        { href: "/risk/assessments", label: "Assessments", ready: true },
        { href: "/analytics/reports", label: "Reports", ready: true },
      ],
    },
    {
      key: "access",
      label: "Identity & Access",
      href: "/access/insights",
      ready: true,
      // IAM overlay — no RBAC matrix, provisioning or role editing here (those
      // live in IAM). The other current I&A routes stay live for deep links.
      children: [
        { href: "/access/insights", label: "Personal data access review", ready: true },
        { href: "/access/drift", label: "Dormant accounts", ready: true },
      ],
    },
    {
      key: "audit-escalation",
      label: "Audit & Escalation",
      href: "/audit",
      ready: true,
      badge: counts.auditOpen,
      children: [
        // Masking events live in the single hash-chained Audit log (Module filter).
        { href: "/audit", label: "Audit log", ready: true },
        { href: "/audit-trail/evidence", label: "Evidence requests", ready: true, badge: counts.auditOpen || undefined },
        { href: "/audit-trail/rulings", label: "DPO rulings", ready: true },
      ],
    },

    // Settings is pinned to the bottom of the sidebar, below a divider.
    {
      key: "settings",
      label: "Settings",
      href: "/settings/organization",
      ready: true,
      footer: true,
      children: [
        { href: "/settings/organization", label: "Organization", ready: true },
        { href: "/settings/entity-setup", label: "Entity setup", ready: true },
        { href: "/settings/users", label: "Users", ready: true },
        // Integration setup is now the Setup tab of Integrations; route stays live.
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
  children,
}: {
  active: string;
  /** Kept for call-site compatibility; the shell no longer shows a title bar. */
  title?: string;
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
  const [openRequests, unread, auditOpen, maskingPending] = await Promise.all([
    db.dataPrincipalRequest.count({
      where: { status: { notIn: ["closed", "rejected"] } },
    }),
    countUnread(session.role),
    // Audit & Escalation queue badge: open evidence requests awaiting action.
    db.evidenceRequest.count({ where: { status: { notIn: ["fulfilled", "resolved", "closed"] } } }),
    // Masking policy badge (shown to the DPO only): proposals awaiting a decision.
    db.maskingChangeRequest.count({ where: { status: "pending" } }),
  ]);

  const name = session.actor.label;
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "")}@privacyconsole.in`;

  return (
    <ShellFrame
      nav={navGroups({ openRequests, auditOpen, maskingPending }, session.role)}
      active={active}
      brandName="Privacy Admin"
      brandCaption="PRIVACY CONSOLE"
      initials={initialsOf(name)}
      name={name}
      email={email}
      currentRole={session.role}
      unread={unread}
    >
      {children}
    </ShellFrame>
  );
}
