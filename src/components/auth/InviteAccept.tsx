"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Check } from "lucide-react";
import { switchRole } from "@/app/actions/session";
import { ROLE_LABEL, type SetupRole } from "@/lib/setup/tasks";

/**
 * S2 — Accept invitation. Branch A: SSO (the connected domain, no password).
 * Branch B: create a password, set up two-step verification, save backup codes.
 * Demo over the role cookie: accepting sets the invited role; the guard routes.
 */
export function InviteAccept({ token, org, role, person, invitedBy }: {
  token: string; org: string; role: SetupRole; person: string; invitedBy?: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [branch, setBranch] = useState<"sso" | "password">("sso");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const backupCodes = useMemo(() => Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 7).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase()), []);

  const strength = pw.length >= 16 ? "Strong" : pw.length >= 12 ? "Good" : pw ? "Too short" : "";
  const accept = () => start(async () => { await switchRole(role as never); router.push("/dashboard"); });
  const finishPassword = () => {
    if (pw.length < 12) { setErr("Use at least 12 characters. A passphrase is best."); return; }
    if (!/^\d{6}$/.test(code)) { setErr("Enter the 6-digit code from your authenticator."); return; }
    if (!savedCodes) { setErr("Copy or download your backup codes first."); return; }
    setErr(null); accept();
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>{org}</strong><span className="chip">{ROLE_LABEL[role]}</span>
      </div>
      <p className="cell-sub" style={{ margin: 0 }}>Hi {person.split(" ")[0]}, you’ve been added as <strong>{ROLE_LABEL[role]}</strong>{invitedBy ? ` — ${invitedBy} added you.` : "."} You’ll set up the platform with your team.</p>

      {branch === "sso" ? (
        <>
          <p className="cell-sub" style={{ margin: 0 }}>Meridian signs in with miniOrange IAM. Two-step verification comes from your identity provider.</p>
          <button className="btn primary" onClick={accept}>Continue with Meridian SSO</button>
          <button className="link-btn" onClick={() => setBranch("password")}>Set up with a password instead</button>
        </>
      ) : (
        <>
          <label className="fld"><span>Create password</span><input className="input" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} placeholder="At least 12 characters" /><span className="cell-sub">Use a passphrase. Length beats symbols.{strength && <> · <strong>{strength}</strong></>}</span></label>

          <div className="fld"><span>Set up two-step verification</span>
            <div className="row" style={{ gap: 12, alignItems: "flex-start", marginTop: 4 }}>
              <div style={{ width: 96, height: 96, background: "repeating-conic-gradient(#0f172a 0% 25%, #fff 0% 50%) 50%/16px 16px", borderRadius: 8, flexShrink: 0 }} aria-label="QR code" />
              <div className="stack" style={{ gap: 6 }}>
                <span className="cell-sub">Scan with miniOrange / Google / Microsoft Authenticator. <a href="#" className="link-btn">Can’t scan? Enter this key</a></span>
                <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" style={{ maxWidth: 140 }} />
              </div>
            </div>
          </div>

          <div className="fld"><span>Backup codes</span>
            <div className="inv-card" style={{ fontFamily: "var(--mono, monospace)", fontSize: 12, columns: 2, gap: 6, padding: 10 }}>{backupCodes.map((c) => <div key={c}>{c}</div>)}</div>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn sec sm" onClick={() => { navigator.clipboard?.writeText(backupCodes.join("\n")).catch(() => {}); setSavedCodes(true); }}>{savedCodes ? <Check size={13} /> : <Copy size={13} />} Copy</button>
              <button className="btn sec sm" onClick={() => { const b = new Blob([backupCodes.join("\n")], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "meridian-backup-codes.txt"; a.click(); setSavedCodes(true); }}><Download size={13} /> Download</button>
            </div>
            <span className="cell-sub">Admins, DPOs and CISOs must use two-step verification (DPDP Rules, Rule 6).</span>
          </div>

          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
          <button className="btn primary" disabled={!savedCodes} onClick={finishPassword}>Finish and continue</button>
          <button className="link-btn" onClick={() => setBranch("sso")}>Use Meridian SSO instead</button>
        </>
      )}
    </div>
  );
}
