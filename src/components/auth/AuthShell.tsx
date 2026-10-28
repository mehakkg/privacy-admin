import type { ReactNode } from "react";

/** Centered auth card (login / invite / MFA), 440px, miniOrange Privacy logo above. */
export function AuthShell({ children, width = 440 }: { children: ReactNode; width?: number }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-sunken, #f8fafc)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: width }}>
        <div className="row" style={{ gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent, #2563eb)", display: "inline-block" }} />
          <strong>miniOrange Privacy</strong>
        </div>
        <div className="inv-card" style={{ padding: 24 }}>{children}</div>
        <p className="cell-sub" style={{ textAlign: "center", marginTop: 14, fontSize: 12 }}>Protected by miniOrange. Every sign-in is logged.</p>
      </div>
    </div>
  );
}
