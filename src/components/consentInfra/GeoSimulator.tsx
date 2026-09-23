"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Notice } from "@/components/ui";
import { BannerPreview } from "@/components/consentInfra/BannerPreview";
import { SIMULATOR_LOCATIONS, detectComplianceModel, BANNER_BY_MODEL } from "@/lib/cookieCompliance";

export function GeoSimulator() {
  const [code, setCode] = useState("IN");
  // The REAL detection logic — the same function live traffic would run.
  const model = detectComplianceModel(code);
  const banner = BANNER_BY_MODEL[model];
  const loc = SIMULATOR_LOCATIONS.find((l) => l.code === code);

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head"><span className="row" style={{ gap: 6 }}><MapPin size={14} /> Simulate a visitor location</span></div>
        <div className="card-body">
          <label className="fld"><span>Location</span>
            <select className="input" value={code} onChange={(e) => setCode(e.target.value)}>
              {SIMULATOR_LOCATIONS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </label>
          <p className="cell-sub">Detected compliance model: <strong>{banner.label}</strong>{model === "none" && " — no specific regional model, so the strictest baseline applies."}</p>
          <Notice tone="info" title="Real detection, not a mock">This calls the same geo→model logic a live visitor triggers, so a pass here reflects what would actually render.</Notice>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="section-label">Banner that would render for {loc?.name}</span>
        <BannerPreview banner={banner} language="English" />
      </div>
    </div>
  );
}
