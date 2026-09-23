"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { Notice } from "@/components/ui";
import { BannerPreview } from "@/components/consentInfra/BannerPreview";
import { resolveBannerLanguage, BANNER_BY_MODEL } from "@/lib/cookieCompliance";

export function LanguageSimulator({ available, simulatable }: { available: string[]; simulatable: string[] }) {
  const [requested, setRequested] = useState(simulatable[0] ?? "Hindi");
  // Real mapping against the actually-managed variant set (Scenario 8).
  const resolved = resolveBannerLanguage(requested, available);
  const banner = BANNER_BY_MODEL.dpdp;

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head"><span className="row" style={{ gap: 6 }}><Languages size={14} /> Simulate a visitor language</span></div>
        <div className="card-body">
          <label className="fld"><span>Detected language</span>
            <select className="input" value={requested} onChange={(e) => setRequested(e.target.value)}>
              {simulatable.map((l) => <option key={l} value={l}>{l}{available.includes(l) ? "" : " — unsupported"}</option>)}
            </select>
          </label>
          {resolved.fallback ? (
            <Notice tone="warn" title={`No managed variant for ${resolved.requested}`}>Defined fallback applied — the banner renders in <strong>English</strong> (the base language) rather than failing.</Notice>
          ) : (
            <Notice tone="ok" title={`Managed variant found for ${resolved.requested}`}>The banner renders in the visitor&rsquo;s own language from the Scenario-8 variant set.</Notice>
          )}
          <p className="cell-sub">Checked against {available.length} managed language variant(s), not a guess.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="section-label">Banner that would render</span>
        <BannerPreview banner={banner} language={resolved.language} fallback={resolved.fallback} />
      </div>
    </div>
  );
}
