"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Users, Lock, Check, ArrowRight } from "lucide-react";

/**
 * Sign-in (redesign comp). Split layout: a navy brand hero on the left and the
 * sign-in form on the right. This is a demo workspace with no real auth — both
 * sign-in paths land on the Overview dashboard.
 */
export default function LoginPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const enter = () => router.push("/home");

  return (
    <div className="lg">
      {/* Left — brand hero */}
      <aside className="lg-hero">
        <div className="lg-hero-rings" aria-hidden />
        <div className="lg-brand">
          <span className="lg-logo">mO</span>
          <span className="lg-brand-txt">
            <strong>miniOrange</strong>
            <span>DATA PRIVACY</span>
          </span>
        </div>

        <div className="lg-hero-body">
          <span className="lg-badge"><ShieldCheck size={15} /> Built for India’s DPDP Act</span>
          <h1 className="lg-hero-title">Privacy operations,<br />made accountable.</h1>
          <p className="lg-hero-sub">Discover personal data, govern risk, respond to rights, and demonstrate compliance from one trusted workspace.</p>

          <ul className="lg-feats">
            {[
              ["End-to-end privacy", "Seven connected program stages"],
              ["Role-based workspaces", "Built for every privacy stakeholder"],
              ["Enterprise security", "Connected with TPRM, DLP, and IAM"],
            ].map(([t, d]) => (
              <li key={t}>
                <span className="lg-feat-ic"><Check size={13} strokeWidth={3} /></span>
                <span className="stack" style={{ gap: 1 }}>
                  <strong>{t}</strong>
                  <span>{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="lg-hero-foot">Trusted privacy infrastructure by miniOrange</p>
      </aside>

      {/* Right — sign-in */}
      <main className="lg-panel">
        <form className="lg-form" onSubmit={(e) => { e.preventDefault(); enter(); }}>
          <p className="lg-kicker">Welcome back</p>
          <h2 className="lg-title">Sign in to your workspace</h2>
          <p className="lg-lead">Continue managing your organization’s privacy program.</p>

          <button type="button" className="lg-sso" onClick={enter}>
            <span className="lg-sso-ic">s</span>
            Continue with miniOrange SSO
          </button>

          <div className="lg-divider"><span>or sign in with email</span></div>

          <label className="lg-field">
            <span className="lg-label">Work email</span>
            <span className="lg-input">
              <Users size={16} className="lg-input-ic" />
              <input type="email" placeholder="you@company.com" autoComplete="email" />
            </span>
          </label>

          <label className="lg-field">
            <span className="lg-label">Password</span>
            <span className="lg-input">
              <Lock size={16} className="lg-input-ic" />
              <input type={showPw ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" />
              <button type="button" className="lg-show" onClick={() => setShowPw((s) => !s)}>{showPw ? "Hide" : "Show"}</button>
            </span>
          </label>

          <div className="lg-row">
            <label className="lg-remember">
              <input type="checkbox" /> Keep me signed in
            </label>
            <a href="#" className="lg-link">Forgot password?</a>
          </div>

          <button type="submit" className="lg-submit">Sign in securely <ArrowRight size={17} /></button>

          <p className="lg-switch">New to miniOrange? <Link href="/setup/wizard" className="lg-link">Create your privacy workspace</Link></p>
          <p className="lg-terms">By continuing, you agree to the Terms of Use and Privacy Policy.</p>
        </form>
      </main>
    </div>
  );
}
