import { ShieldAlert } from "lucide-react";

/**
 * SCREEN 6 — Enforcement-Status Banner.
 *
 * Non-dismissible and unconditional on every masking screen that exposes an edit
 * action. It states plainly that RBAC and approval-workflow enforcement are not
 * yet active at the API level, so this console never implies a control the
 * backend does not actually enforce.
 *
 * REMOVAL CRITERION (not a toggle): delete this banner only once AuthorizationGate
 * is confirmed enforcing per-role checks for real. There is deliberately no prop
 * to hide it — its absence must mean enforcement shipped, nothing less.
 */
export function EnforcementBanner() {
  return (
    <div className="notice warn" role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
      <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div className="notice-title">Enforcement not yet active</div>
        <div>
          Approval and role-based enforcement are not yet active on this platform. Any
          authenticated user for this tenant can currently create, edit, or delete this
          tenant&rsquo;s entire masking configuration. The role and lock treatments below are
          shown for legibility — they are not yet enforced at the API level.
        </div>
      </div>
    </div>
  );
}
