"use client";

import { useState } from "react";
import { ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Slim, non-dismissible enforcement strip. There is no "Got it" / dismiss — it
 * states plainly that AuthorizationGate is not enforcing, and stays until it is.
 * The full explanation sits behind a Details toggle so the strip stays thin.
 * "Pending" states remain advisory until real enforcement ships.
 */
export function EnforcementNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mask-enforce-strip" role="status">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <ShieldAlert size={15} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          Enforcement is not active at the API level — proposals and role checks shown here are advisory, not blocked server-side.
        </span>
        <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Review setup
        </button>
      </div>
      {open && (
        <div className="cell-sub" style={{ marginTop: 6 }}>
          AuthorizationGate currently returns true for every request and the approval workflow has status columns
          only, so the UI models the correct flow — Admin proposes changes to governed rules and the DPO approves —
          but the API does not yet reject a direct write. This strip is removed only when AuthorizationGate is
          confirmed enforcing per-role checks.
        </div>
      )}
    </div>
  );
}
