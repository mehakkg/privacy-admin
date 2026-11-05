import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { countUnread } from "@/lib/engines/notification";
import { getDlpHealth } from "@/lib/engines/dlp";
import { getInventoryCounts } from "@/lib/engines/inventory";
import { getActivityCounts } from "@/lib/engines/activities";
import { requireSetupGate } from "@/lib/guards/setupGate";
import { getProfile, getSetupState } from "@/lib/setup/state";
import { profileComplete } from "@/lib/setup/plan";
import { allRequiredDone } from "@/lib/setup/tasks";
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
function navGroups(counts: NavCounts, role: ActorRole, showSetup: boolean): NavEntry[] {
  return [
    // Setup shows above Home until setup is complete (unified-nav §3.1).
    ...(showSetup ? [{ key: "setup", label: "Setup", href: "/setup", ready: true } as NavEntry] : []),
    { key: "home", label: "Home", href: "/home", ready: true },
    { key: "my-work", label: "My work", href: "/my-work", ready: true },

    // ---- OPERATE ----
    { section: "Operate" },
    { key: "requests", label: "Requests", href: "/requests", ready: true, badge: counts.openRequests || undefined, badgeLabel: `${counts.openRequests} open requests` },
    { key: "breaches", label: "Breaches", href: "/breaches", ready: true },
    { key: "access", label: "Access changes", href: "/access/changes", ready: true },

    // ---- CONFIGURE ----
    { section: "Configure" },
    {
      key: "data-map", label: "Data Map", href: "/data-map/inventory", ready: true,
      children: [
        { href: "/data-map/inventory", label: "Data inventory", ready: true, badge: counts.inventoryGaps || undefined, badgeLabel: `${counts.inventoryGaps} inventory gaps`, warn: counts.dlpWarn },
        { href: "/data-map/activities", label: "Activities", ready: true, badge: counts.activitiesNeedsWork || undefined, badgeLabel: `${counts.activitiesNeedsWork} activities need work` },
        { href: "/data-map/purposes", label: "Purposes", ready: true },
        { href: "/data-map/processors", label: "Processors", ready: true },
        { href: "/data-map/flow", label: "Data flow", ready: true },
      ],
    },
    {
      key: "data-protection", label: "Data Protection", href: "/data-protection/rules", ready: true,
      children: [
        { href: "/data-protection/rules", label: "Protection rules", ready: true, badge: role === "dpo" ? counts.maskingPending : undefined },
        { href: "/data-protection/retention", label: "Retention", ready: true },
      ],
    },
    {
      key: "consent", label: "Consent & Notices", href: "/consent/notices", ready: true,
      children: [
        { href: "/consent/notices", label: "Notices", ready: true },
        { href: "/consent/collection-points", label: "Collection points", ready: true },
        { href: "/consent/records", label: "Consent records", ready: true },
      ],
    },

    // ---- GOVERN & REVIEW ----
    { section: "Govern & review" },
    { key: "escalations", label: "Escalations", href: "/escalations", ready: true, badge: counts.escalationsOpen || undefined, badgeLabel: `${counts.escalationsOpen} open escalations` },
    { key: "audit", label: "Audit log", href: "/audit", ready: true },
    { key: "reports", label: "Reports", href: "/reports", ready: true },
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
  // Single chokepoint for the setup route guard. Every page renders through Shell,
  // so guarding here covers all of them. Explore freely: only an unfinished profile
  // (Admin/DPO) or an unseen plan redirects; the setup routes exempt themselves.
  await requireSetupGate(active);

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

  // Setup leaf shows above Home until every required task is done.
  const [setupProfile, setupState] = await Promise.all([getProfile(), getSetupState()]);
  const showSetup = profileComplete(setupProfile) && !allRequiredDone(setupState);

  const name = session.actor.label;
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "")}@privacyconsole.in`;

  return (
    <ShellFrame
      nav={navGroups({ openRequests, auditOpen, maskingPending, inventoryGaps, activitiesNeedsWork, ropaPending, escalationsOpen, dlpWarn: dlpHealth.warnText }, session.role, showSetup)}
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
