/**
 * TPRM navigation — the single source of truth (tprm-nav §0, §2).
 *
 * One config, filtered by the signed-in user's permissions. There are NO per-role
 * menus in code: each item declares the permission(s) it needs (Requires), and an
 * item is visible if the user holds ANY of them. Custom roles then get the right
 * menu automatically. Routes keep the existing page's route where one exists.
 */

/** A Requires entry is an exact permission code, or the wildcard "*:SUFFIX"
 *  meaning "any permission ending in :SUFFIX" (e.g. "*:APPROVE"). An empty
 *  Requires array means always-visible for console users (e.g. Dashboard). */
export type Requirement = string;

export interface NavItem {
  id: string;
  label: string;
  route: string;
  /** Visible if the user holds ANY of these; [] = always (console users). */
  requires: Requirement[];
  /** Extra gate beyond permissions (currently only "dora"). */
  condition?: "dora";
  /** Which placement band this belongs to; system-config / administration appear
   *  in the sidebar only in `sidebar` mode (§4). */
  band: "general" | "vendor-mgmt" | "risk" | "monitoring" | "governance" | "system-config" | "administration";
  /** Subgroup within system configuration (sidebar mode collapsible rows). */
  subgroup?: "questionnaire-setup" | "rules-workflow";
}

export interface NavSection { label: string; band: NavItem["band"]; items: NavItem[] }

// GENERAL
const GENERAL: NavItem[] = [
  { id: "dashboard", label: "Dashboard", route: "/dashboard", requires: [], band: "general" },
  { id: "pendingActions", label: "Pending Actions", route: "/pending-actions", band: "general",
    requires: ["*:APPROVE", "VENDOR_DUE_DILIGENCE:REVIEW", "SUB_VENDOR_DUE_DILIGENCE:REVIEW", "VENDOR_CONTRACTS:LEGAL_REVIEW", "VENDOR_CONTRACTS:SIGN"] },
];

// VENDOR MANAGEMENT
const VENDOR_MGMT: NavItem[] = [
  { id: "intake", label: "Intake Requests", route: "/intake-requests", requires: ["INTAKE:READ"], band: "vendor-mgmt" },
  { id: "vendors", label: "Vendors", route: "/vendors", requires: ["VENDOR:READ"], band: "vendor-mgmt" },
  { id: "subVendors", label: "Sub-Vendors", route: "/sub-vendors", requires: ["SUB_VENDOR:READ"], band: "vendor-mgmt" },
];

// RISK & ASSESSMENTS
const RISK: NavItem[] = [
  { id: "assessmentQueue", label: "Assessment Queue", route: "/assessments", requires: ["VENDOR_ASSESSMENTS:READ", "SUB_VENDOR_ASSESSMENTS:READ"], band: "risk" },
  { id: "reassessments", label: "Reassessments", route: "/reassessments", requires: ["VENDOR_ASSESSMENTS:READ", "SUB_VENDOR_ASSESSMENTS:READ"], band: "risk" },
  { id: "dueDiligence", label: "Due Diligence", route: "/due-diligence", requires: ["VENDOR_DUE_DILIGENCE:READ", "SUB_VENDOR_DUE_DILIGENCE:READ"], band: "risk" },
  { id: "issues", label: "Issues", route: "/issues", requires: ["FINDINGS:READ"], band: "risk" },
  { id: "riskExceptions", label: "Risk Exceptions", route: "/risk-exceptions", requires: ["RISK_EXCEPTIONS:READ"], band: "risk" },
  { id: "pendingOverrides", label: "Pending Overrides", route: "/pending-overrides", requires: ["VENDOR_IRQ:APPROVE", "SUB_VENDOR_IRQ:APPROVE"], band: "risk" },
];

// CONTINUOUS MONITORING
const MONITORING: NavItem[] = [
  { id: "alerts", label: "Alert Inbox", route: "/alerts", requires: ["ALERTS:READ"], band: "monitoring" },
  { id: "incidents", label: "Incident Log", route: "/incidents", requires: ["INCIDENTS:READ"], band: "monitoring" },
  { id: "certificates", label: "Certificate Tracker", route: "/certificates", requires: ["CERTIFICATES:READ"], band: "monitoring" },
  { id: "contractExpiry", label: "Contract Expiry", route: "/contract-expiry", requires: ["CONTRACT_EXPIRY:READ"], band: "monitoring" },
];

// GOVERNANCE & REPORTING
const GOVERNANCE: NavItem[] = [
  { id: "compliance", label: "Compliance Overview", route: "/compliance", requires: ["COMPLIANCE:READ"], band: "governance" },
  { id: "dora", label: "DORA Register", route: "/dora-register", requires: ["REGULATORY:READ"], condition: "dora", band: "governance" },
  { id: "reports", label: "Reports & Exports", route: "/reports", requires: ["REPORTS:READ"], band: "governance" },
  { id: "audit", label: "Audit Log", route: "/audit", requires: ["AUDIT:READ"], band: "governance" },
];

// SYSTEM CONFIGURATION (sidebar mode only; settings mode moves these behind ⚙)
const SYSTEM_CONFIG: NavItem[] = [
  { id: "qTemplates", label: "Questionnaire Templates", route: "/settings/tprm/questionnaires?tab=templates", requires: ["TEMPLATES:READ"], band: "system-config", subgroup: "questionnaire-setup" },
  { id: "irq", label: "Inherent Risk Questionnaires", route: "/settings/tprm/questionnaires?tab=inherent", requires: ["CONFIG_IRQ:WRITE"], band: "system-config", subgroup: "questionnaire-setup" },
  { id: "subIrq", label: "Sub-Inherent Risk Questionnaires", route: "/settings/tprm/questionnaires?tab=sub-inherent", requires: ["CONFIG_IRQ:WRITE"], band: "system-config", subgroup: "questionnaire-setup" },
  { id: "ddEvidence", label: "Due Diligence Evidence Requirements", route: "/settings/tprm/evidence?tab=requirements", requires: ["CONFIG_CONTROLS:WRITE"], band: "system-config", subgroup: "questionnaire-setup" },
  { id: "controls", label: "Control Library", route: "/settings/tprm/evidence?tab=controls", requires: ["CONFIG_CONTROLS:WRITE"], band: "system-config", subgroup: "questionnaire-setup" },
  { id: "workflows", label: "Workflows", route: "/settings/tprm/rules?tab=workflows", requires: ["CONFIG_RULES:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "appetite", label: "Risk Appetite", route: "/settings/tprm/rules?tab=appetite", requires: ["CONFIG_RULES:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "cadence", label: "Reassessment Cadence", route: "/settings/tprm/rules?tab=cadence", requires: ["CONFIG_RULES:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "fields", label: "Custom Fields", route: "/settings/tprm/data?tab=fields", requires: ["CONFIG_FIELDS:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "clauses", label: "Contract Clause & Rules", route: "/settings/tprm/contracts", requires: ["CONFIG_FIELDS:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "regulatory", label: "Regulatory Obligations", route: "/settings/tprm/data?tab=regulatory", requires: ["CONFIG_REGULATORY:WRITE"], band: "system-config", subgroup: "rules-workflow" },
  { id: "subUsage", label: "Sub-Usage Rules", route: "/settings/tprm/rules?tab=sub-usage", requires: ["SUB_VENDOR_USAGE_REASONS:WRITE"], band: "system-config", subgroup: "rules-workflow" },
];

// ADMINISTRATION (sidebar mode only)
const ADMINISTRATION: NavItem[] = [
  { id: "users", label: "Users & Roles", route: "/settings/users", requires: ["USERS:WRITE", "ROLES:WRITE"], band: "administration" },
  { id: "branding", label: "Branding", route: "/settings/branding?tab=tprm", requires: ["CONFIG_BRANDING:WRITE"], band: "administration" },
];

export const CONSOLE_SECTIONS: NavSection[] = [
  { label: "General", band: "general", items: GENERAL },
  { label: "Vendor management", band: "vendor-mgmt", items: VENDOR_MGMT },
  { label: "Risk & assessments", band: "risk", items: RISK },
  { label: "Continuous monitoring", band: "monitoring", items: MONITORING },
  { label: "Governance & reporting", band: "governance", items: GOVERNANCE },
  { label: "System configuration", band: "system-config", items: SYSTEM_CONFIG },
  { label: "Administration", band: "administration", items: ADMINISTRATION },
];

// --- Vendor portal (a separate shell, §5) -----------------------------------
export interface PortalItem { id: string; section: string | null; label: string; route: string; requires: Requirement[] }

export const PORTAL_ITEMS: PortalItem[] = [
  { id: "vHome", section: null, label: "Home", route: "/portal", requires: ["PORTAL_OVERVIEW:READ"] },
  { id: "vTodo", section: null, label: "To do", route: "/portal/todo", requires: ["PORTAL_*:READ"] },
  { id: "vAssessments", section: "Requests", label: "Assessments", route: "/portal/assessments", requires: ["PORTAL_ASSESSMENTS:READ"] },
  { id: "vEvidence", section: "Requests", label: "Evidence", route: "/portal/evidence", requires: ["PORTAL_DUE_DILIGENCE:READ", "PORTAL_ATTESTATIONS:READ", "PORTAL_AUDIT_REQUESTS:READ"] },
  { id: "vFindings", section: "Requests", label: "Findings", route: "/portal/findings", requires: ["PORTAL_FINDINGS:READ"] },
  { id: "vInstructions", section: "Requests", label: "Instructions", route: "/portal/instructions", requires: ["PORTAL_INSTRUCTIONS:READ"] },
  { id: "vIncidents", section: "Our relationship", label: "Incidents", route: "/portal/incidents", requires: ["PORTAL_INCIDENTS:READ"] },
  { id: "vContracts", section: "Our relationship", label: "Contracts", route: "/portal/contracts", requires: ["PORTAL_CONTRACTS:READ"] },
  { id: "vDocuments", section: "Our relationship", label: "Documents", route: "/portal/documents", requires: ["PORTAL_DOCUMENTS:READ"] },
  { id: "vSubVendors", section: "Our relationship", label: "Sub-vendors", route: "/portal/sub-vendors", requires: ["PORTAL_SUB_VENDORS:READ"] },
  { id: "vCompany", section: "Company", label: "Company profile", route: "/portal/company", requires: ["PORTAL_COMPANY:READ"] },
  { id: "vUsers", section: "Company", label: "Users", route: "/portal/users", requires: ["PORTAL_USERS:READ"] },
];

// Removed console items → redirect, don't 404 (§2).
export const CONSOLE_REDIRECTS: Record<string, { to: string; toast?: string }> = {
  "/vendor-portfolio": { to: "/vendors" },
  "/sub-vendor-portfolio": { to: "/sub-vendors" },
  "/vendor-contacts": { to: "/vendors", toast: "Contacts are on each vendor's page." },
  "/home": { to: "/dashboard" },
};
