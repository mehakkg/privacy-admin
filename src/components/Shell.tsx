import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { getDlpHealth } from "@/lib/engines/dlp";
import { getInventoryCounts } from "@/lib/engines/inventory";
import { getActivityCounts } from "@/lib/engines/activities";
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
  inventoryGaps: number;
  activitiesNeedsWork: number;
  ropaPending: number;
  escalationsOpen: number;
  dlpWarn: string | null;
}

/**
 * Admin-portal navigation (nav restructure spec). Macro groups in use-frequency
 * order: OPERATE (daily) → CONFIGURE (set once) → GOVERN & REVIEW → SETTINGS.
 * Single-item modules (Escalations, Evidence requests, Audit log, Approved policy)
 * are leaf rows directly under their macro label. A parent's badge (shown only
 * when collapsed) is the sum of its children's — so Data Map = 3 + 5 + 3 = 11.
 */
function navGroups(counts: NavCounts, role: ActorRole): NavEntry[] {
  return [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", ready: true },
    // Legal/Procurement's dedicated home — role-scoped, appears only while acting
    // as Legal. Not part of the macro structure.
    ...(role === "legal"
      ? [{ key: "tprm-dashboard", label: "TPRM Dashboard", href: "/tprm", ready: true } as NavEntry]
      : []),

    // ---- OPERATE: what the Admin runs daily. ----
    { section: "Operate" },
    {
      key: "rights", label: "Rights Requests", href: "/requests", ready: true, badge: counts.openRequests,
      children: [
        { href: "/requests", label: "Requests", ready: true, badge: counts.openRequests || undefined, badgeLabel: `${counts.openRequests} open requests` },
        { href: "/requests/identity-matching", label: "Identity matching", ready: true },
        { href: "/requests/deletion-instructions", label: "Deletion instructions", ready: true },
        { href: "/requests/sla", label: "SLA & routing", ready: true },
      ],
    },
    {
      key: "breach", label: "Breach Management", href: "/breach/incidents", ready: true,
      children: [
        { href: "/breach/incidents", label: "Incidents", ready: true },
        { href: "/breach/investigation", label: "Investigation", ready: true },
        { href: "/breach/notifications", label: "Notifications & Board reporting", ready: true },
      ],
    },
    {
      key: "tprm", label: "Vendor Risk (TPRM)", href: "/vendor-risk/register", ready: true,
      children: [
        { href: "/vendor-risk/register", label: "Vendor register", ready: true },
        { href: "/vendor-risk/assessments", label: "Vendor assessments", ready: true },
        { href: "/vendor-risk/sub-processor-disclosures", label: "Sub-processor disclosures", ready: true },
      ],
    },
    {
      // IAM overlay (renamed from Identity & Access) — tracking and evidence only;
      // provisioning/role-editing stay in miniOrange IAM.
      key: "access", label: "Access", href: "/access/insights", ready: true,
      children: [
        { href: "/access/changes", label: "Access changes", ready: true },
        { href: "/access/insights", label: "Personal data access review", ready: true },
        { href: "/access/drift", label: "Dormant accounts", ready: true },
      ],
    },

    // ---- CONFIGURE: foundations set once. ----
    { section: "Configure" },
    {
      key: "data-map", label: "Data Map", href: "/data-map/inventory", ready: true,
      children: [
        { href: "/data-map/inventory", label: "Data inventory", ready: true, badge: counts.inventoryGaps || undefined, badgeLabel: `${counts.inventoryGaps} inventory gaps`, warn: counts.dlpWarn },
        { href: "/data-map/processing-activities", label: "Processing activities", ready: true, badge: counts.activitiesNeedsWork || undefined, badgeLabel: `${counts.activitiesNeedsWork} activities need work` },
        { href: "/data-flow/map", label: "Data flow", ready: true },
        { href: "/discovery/ropa", label: "ROPA", ready: true, badge: counts.ropaPending || undefined, badgeLabel: `${counts.ropaPending} pending recommendations` },
      ],
    },
    {
      key: "data-protection", label: "Data Protection", href: "/data-flow/protection-rules", ready: true,
      children: [
        { href: "/data-flow/protection-rules", label: "Protection rules", ready: true, badge: role === "dpo" ? counts.maskingPending : undefined },
        { href: "/data-flow/masking-policy", label: "Masking policy", ready: true },
        { href: "/data-protection/retention", label: "Retention schedules", ready: true },
      ],
    },
    {
      key: "consent", label: "Consent & Notices", href: "/consent/notices", ready: true,
      children: [
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/platform", label: "Consent collection", ready: true },
        { href: "/consent/records", label: "Consent records", ready: true },
        { href: "/consent/cookies", label: "Cookie & website scan", ready: true },
      ],
    },

    // ---- GOVERN & REVIEW: oversight, evidence and policy (leaf rows + Risk). ----
    { section: "Govern & review" },
    { key: "escalations", label: "Escalations", href: "/escalations", ready: true, badge: counts.escalationsOpen || undefined, badgeLabel: `${counts.escalationsOpen} open escalations` },
    { key: "evidence", label: "Evidence requests", href: "/audit-trail/evidence", ready: true, badge: counts.auditOpen || undefined, badgeLabel: `${counts.auditOpen} open evidence requests` },
    { key: "audit", label: "Audit log", href: "/audit", ready: true },
    { key: "governance", label: "Approved policy", href: "/governance", ready: true, locked: role !== "dpo" && role !== "ciso" },
    {
      key: "risk", label: "Risk & Reports", href: "/analytics/risk", ready: true,
      children: [
        { href: "/analytics/risk", label: "Risk dashboard", ready: true },
        { href: "/analytics/reports", label: "Reports", ready: true },
      ],
    },

    // ---- SETTINGS: leaf rows. ----
    { section: "Settings" },
    { key: "settings-org", label: "Organization", href: "/settings/organization", ready: true },
    { key: "settings-users", label: "Users", href: "/settings/users", ready: true },
    { key: "settings-connectors", label: "Connectors", href: "/integrations", ready: true },
    { key: "settings-health", label: "Connection health", href: "/integrations/health", ready: true },
    { key: "settings-notifications", label: "Notifications", href: "/notifications/channels", ready: true },
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
  const [openRequests, unread, auditOpen, maskingPending, invCounts, actCounts, ropaPending, escalationsOpen, dlpHealth] = await Promise.all([
    db.dataPrincipalRequest.count({
      where: { status: { notIn: ["closed", "rejected"] } },
    }),
    countUnread(session.role),
    // Audit & Escalation queue badge: open evidence requests awaiting action.
    db.evidenceRequest.count({ where: { status: { notIn: ["fulfilled", "resolved", "closed"] } } }),
    // Masking policy badge (shown to the DPO only): proposals awaiting a decision.
    db.maskingChangeRequest.count({ where: { status: "pending" } }),
    // Data inventory badge = the "Needs attention" count, from the SAME readiness
    // derivation the inventory page uses (one source of truth).
    getInventoryCounts(),
    // Processing activities badge = the needs-work count, same source as the list.
    getActivityCounts(),
    // ROPA badge: pending ROPA recommendations awaiting a DPO decision.
    db.ropaSuggestion.count({ where: { status: "pending" } }),
    // Escalations badge (Govern & Review): open escalations awaiting a decision.
    db.escalation.count({ where: { status: "open" } }),
    // DLP connection health → the warning on Data inventory.
    getDlpHealth(),
  ]);
  const inventoryGaps = invCounts.attention;
  const activitiesNeedsWork = actCounts.needsWork;

  const name = session.actor.label;
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "")}@privacyconsole.in`;

  return (
    <ShellFrame
      nav={navGroups({ openRequests, auditOpen, maskingPending, inventoryGaps, activitiesNeedsWork, ropaPending, escalationsOpen, dlpWarn: dlpHealth.warnText }, session.role)}
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
