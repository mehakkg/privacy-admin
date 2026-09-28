"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Compact, single-line enforcement notice. Non-dismissible, but the full
 * explanation collapses behind a Details link and stays collapsed after the first
 * view (per user, via localStorage). Shown once per screen, never repeated as a
 * full banner.
 *
 * Removal criterion, not a toggle: this goes only when AuthorizationGate really
 * enforces per-role checks server-side.
 */
export function EnforcementNotice() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("masking.enforcementSeen") === "1";
      setSeen(s);
      if (!s) setOpen(true);
    } catch { /* private mode — default collapsed */ }
  }, []);

  const collapse = () => {
    setOpen(false);
    try { localStorage.setItem("masking.enforcementSeen", "1"); } catch { /* ignore */ }
    setSeen(true);
  };

  return (
    <div className="notice warn mask-enforce" role="status">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <ShieldAlert size={16} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          Role enforcement isn&rsquo;t active at the API yet. Changes shown as proposals are not yet blocked server-side.
        </span>
        <button className="link-btn" onClick={() => (open ? collapse() : setOpen(true))}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Details
        </button>
      </div>
      {open && (
        <div className="cell-sub" style={{ marginTop: 8 }}>
          The UI models the correct governance flow — Admin proposes changes to baseline/regional-governed
          rules and the DPO approves them — but the API does not yet reject a direct write. Treat any
          &ldquo;pending&rdquo; state as advisory until AuthorizationGate is enforcing. {!seen && (
            <button className="link-btn" onClick={collapse} style={{ marginLeft: 4 }}>Got it</button>
          )}
        </div>
      )}
    </div>
  );
}
