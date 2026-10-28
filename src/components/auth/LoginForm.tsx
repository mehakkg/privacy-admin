"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { switchRole } from "@/app/actions/session";

type Step = "email" | "sso" | "password" | "code" | "locked";
const SSO_DOMAIN = "meridianfs.in";

/**
 * S3 — Sign in. Email → (SSO for the connected domain, else password) → two-step
 * code. Demo over the role cookie: a successful sign-in sets the Admin role and
 * the guard routes onward. Account existence is never revealed.
 */
export function LoginForm() {
  const router = useRouter();
  const [, start] = useTransition();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const continueEmail = () => {
    if (!email.includes("@")) { setErr("Enter your work email."); return; }
    setErr(null);
    setStep(email.trim().toLowerCase().endsWith(`@${SSO_DOMAIN}`) ? "sso" : "password");
  };
  const submitPassword = () => {
    if (!password) { bump(); return; }
    setErr(null); setStep("code");
  };
  const bump = () => { const n = attempts + 1; setAttempts(n); if (n >= 5) { setStep("locked"); } else setErr("That email and password don’t match."); };
  const signIn = () => {
    if (!/^\d{6}$/.test(code)) { setErr("That code didn’t work. Codes change every 30 seconds."); return; }
    start(async () => { await switchRole("admin"); router.push("/dashboard"); });
  };
  const sso = () => start(async () => { await switchRole("admin"); router.push("/dashboard"); });

  if (step === "locked") return (
    <div className="stack" style={{ gap: 10 }}>
      <h1 className="inv-title" style={{ margin: 0, fontSize: 18 }}>Too many attempts</h1>
      <p className="cell-sub" style={{ margin: 0 }}>Your account is locked for 15 minutes. Try again at {lockTime()}, or reset your password.</p>
      <a href="#" className="link-btn">Reset password</a>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <h1 className="inv-title" style={{ margin: 0, fontSize: 18 }}>Sign in to miniOrange Privacy</h1>

      {step === "email" && (
        <>
          <label className="fld"><span>Work email</span><input className="input" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") continueEmail(); }} placeholder="you@company.com" /></label>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
          <button className="btn primary" onClick={continueEmail}>Continue</button>
        </>
      )}

      {step === "sso" && (
        <>
          <p className="cell-sub" style={{ margin: 0 }}>Meridian signs in with miniOrange IAM.</p>
          <button className="btn primary" onClick={sso}>Continue with Meridian SSO</button>
          <button className="link-btn" onClick={() => { setStep("email"); setErr(null); }}>Use a different account</button>
        </>
      )}

      {step === "password" && (
        <>
          <div className="cell-sub">{email}</div>
          <label className="fld"><span>Password</span>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" type={showPw ? "text" : "password"} autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }} style={{ flex: 1 }} />
              <button className="icon-btn" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide" : "Show"}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <a href="#" className="link-btn">Forgot password?</a>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
          <button className="btn primary" onClick={submitPassword}>Sign in</button>
        </>
      )}

      {step === "code" && (
        <>
          <p className="cell-sub" style={{ margin: 0 }}>Enter the 6-digit code from your authenticator.</p>
          <label className="fld"><span>Two-step code</span><input className="input" inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") signIn(); }} placeholder="000000" /></label>
          <a href="#" className="link-btn">Use a backup code</a>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
          <button className="btn primary" onClick={signIn}>Sign in</button>
        </>
      )}
    </div>
  );
}

function lockTime(): string {
  const t = new Date(Date.now() + 15 * 60000);
  return t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
