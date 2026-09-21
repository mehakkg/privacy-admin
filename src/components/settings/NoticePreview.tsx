"use client";

/**
 * Live mock of a Data-Principal-facing surface (a consent notice + preference
 * centre) with the current branding applied. Updates in real time as the branding
 * form changes — it's the mechanism that makes a failing-contrast color legible as
 * an actual problem, not an abstract error. Light-default background, per the
 * product's theme bar.
 */
export function NoticePreview({
  orgName, logoUrl, primaryColor, compact = false,
}: {
  orgName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  compact?: boolean;
}) {
  const accent = primaryColor || "#2563eb";
  return (
    <div className={`notice-preview${compact ? " compact" : ""}`}>
      <div className="np-chrome">
        <span className="np-dot" /><span className="np-dot" /><span className="np-dot" />
        <span className="np-url">preferences.{orgName ? orgName.toLowerCase().replace(/[^a-z0-9]+/g, "") : "yourorg"}.example.in</span>
      </div>
      <div className="np-body">
        <div className="np-header" style={{ background: accent }}>
          {logoUrl ? <img src={logoUrl} alt="" className="np-logo" /> : <span className="np-logo-fallback">{(orgName || "Org").slice(0, 1)}</span>}
          <span className="np-header-name">{orgName || "Your Organization"}</span>
        </div>
        <div className="np-content">
          <h4 className="np-title">Privacy notice &amp; your choices</h4>
          <p className="np-text">{orgName || "Your organization"} processes your personal data for the purposes below. You can manage your consent at any time.</p>
          {!compact && (
            <>
              <div className="np-pref-row"><span>Marketing communications</span><span className="np-toggle" style={{ background: accent }} /></div>
              <div className="np-pref-row"><span>Analytics &amp; personalization</span><span className="np-toggle off" /></div>
            </>
          )}
          <a className="np-link" style={{ color: accent }} href="#" onClick={(e) => e.preventDefault()}>Read the full privacy notice →</a>
          <button className="np-btn" style={{ background: accent }}>Save preferences</button>
        </div>
      </div>
    </div>
  );
}
