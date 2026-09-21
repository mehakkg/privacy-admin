"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Upload, AlertTriangle, X } from "lucide-react";
import { ActionError } from "@/components/actions";
import { NoticePreview } from "@/components/settings/NoticePreview";
import { ratioOnWhite, normalizeHex, AA_NORMAL } from "@/lib/wcag";
import { saveBrandingAction, saveEntityBrandingAction, removeEntityBrandingAction, type BrandingInput } from "@/app/actions/orgProfile";
import type { ActionResult } from "@/app/actions/requests";

export interface BrandingValue { logoUrl: string | null; primaryColor: string | null; faviconUrl: string | null }
export interface EntityBranding { id: string; name: string; branding: BrandingValue | null }

function readFileAsDataUrl(file: File, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => cb(r.result as string);
  r.readAsDataURL(file);
}

const WCAG_MSG = "This color combination doesn't meet WCAG AA contrast — text may be unreadable in notices.";

/** Returns the contrast error for a color, or null if it passes / is empty. */
function contrastError(color: string | null): { ratio: number } | null {
  if (!color || !normalizeHex(color)) return null;
  const r = ratioOnWhite(color);
  if (r !== null && r < AA_NORMAL) return { ratio: r };
  return null;
}

export function OrgBrandingForm({
  orgName, initial, entities,
}: {
  orgName: string;
  initial: BrandingValue;
  entities: EntityBranding[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [b, setB] = useState<BrandingValue>(initial);

  const err = contrastError(b.primaryColor);
  const save = () => start(async () => { const r = await saveBrandingAction(b as BrandingInput); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      <div className="branding-grid">
        {/* Form */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 3 }}>
            <span className="section-label">Logo</span>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {b.logoUrl && <img src={b.logoUrl} alt="" className="brand-thumb" />}
              <label className="btn sm"><Upload size={13} /> {b.logoUrl ? "Replace" : "Upload"} logo<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, (u) => setB((s) => ({ ...s, logoUrl: u }))); }} /></label>
              {b.logoUrl && <button className="btn ghost sm" onClick={() => setB({ ...b, logoUrl: null })}>Remove</button>}
            </div>
          </div>

          <div className="stack" style={{ gap: 3 }}>
            <span className="section-label">Primary color</span>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <input type="color" className="color-swatch" value={normalizeHex(b.primaryColor || "") || "#2563eb"} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} />
              <input className="input sm" style={{ width: 120 }} value={b.primaryColor ?? ""} placeholder="#2563eb" onChange={(e) => setB({ ...b, primaryColor: e.target.value })} />
              {b.primaryColor && ratioOnWhite(b.primaryColor) !== null && (
                <span className="cell-sub">contrast {ratioOnWhite(b.primaryColor)!.toFixed(2)}:1 on white</span>
              )}
            </div>
            {err && (
              <div className="wcag-error"><AlertTriangle size={13} /> {WCAG_MSG} <span className="cell-sub">(needs ≥ {AA_NORMAL}:1, this is {err.ratio.toFixed(2)}:1)</span></div>
            )}
          </div>

          <div className="stack" style={{ gap: 3 }}>
            <span className="section-label">Favicon</span>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {b.faviconUrl && <img src={b.faviconUrl} alt="" className="brand-thumb sq" />}
              <label className="btn sm"><Upload size={13} /> {b.faviconUrl ? "Replace" : "Upload"} favicon<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, (u) => setB((s) => ({ ...s, faviconUrl: u }))); }} /></label>
              {b.faviconUrl && <button className="btn ghost sm" onClick={() => setB({ ...b, faviconUrl: null })}>Remove</button>}
            </div>
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn primary" disabled={pending || Boolean(err)} onClick={save} title={err ? "Fix the contrast issue to save" : undefined}>{pending ? "Saving…" : "Save branding"}</button>
          </div>
          <ActionError result={result} />
        </div>

        {/* Live preview — the dominant element */}
        <div className="stack" style={{ gap: 6 }}>
          <span className="section-label">Live preview — preference centre</span>
          <NoticePreview orgName={orgName} logoUrl={b.logoUrl} primaryColor={b.primaryColor} />
          {err && <span className="cell-sub" style={{ color: "var(--red)" }}>Notice the header and button text above — that&rsquo;s what a data principal would struggle to read.</span>}
        </div>
      </div>

      <PerEntityBranding orgName={orgName} entities={entities} orgDefault={initial} />
    </div>
  );
}

function PerEntityBranding({ orgName, entities, orgDefault }: { orgName: string; entities: EntityBranding[]; orgDefault: BrandingValue }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="settings-collapse">
      <button className="settings-collapse-head" onClick={() => setExpanded((x) => !x)}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Manage per-entity branding
        <span className="cell-sub" style={{ marginLeft: 8 }}>An entity with no override inherits the org-wide branding above.</span>
      </button>
      {expanded && (
        <div className="stack" style={{ gap: 12, marginTop: 10 }}>
          {entities.map((en) => <EntityBrandingCard key={en.id} entity={en} orgName={orgName} orgDefault={orgDefault} />)}
          {entities.length === 0 && <span className="cell-sub">No entities yet.</span>}
        </div>
      )}
    </div>
  );
}

function EntityBrandingCard({ entity, orgName, orgDefault }: { entity: EntityBranding; orgName: string; orgDefault: BrandingValue }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const has = Boolean(entity.branding);
  const [override, setOverride] = useState<boolean>(has);
  const [b, setB] = useState<BrandingValue>(entity.branding ?? { logoUrl: null, primaryColor: orgDefault.primaryColor, faviconUrl: null });

  const effective = override ? b : orgDefault;
  const err = contrastError(override ? b.primaryColor : null);
  const save = () => start(async () => { const r = await saveEntityBrandingAction(entity.id, b as BrandingInput); setResult(r); if (r.ok) router.refresh(); });
  const remove = () => start(async () => { const r = await removeEntityBrandingAction(entity.id); setResult(r); if (r.ok) { setOverride(false); router.refresh(); } });

  return (
    <div className="entity-brand-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="cell-primary">{entity.name}</span>
        <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override org branding
        </label>
      </div>
      <div className="branding-grid" style={{ marginTop: 8 }}>
        <div className="stack" style={{ gap: 10 }}>
          {override ? (
            <>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className="section-label" style={{ minWidth: 70 }}>Color</span>
                <input type="color" className="color-swatch" value={normalizeHex(b.primaryColor || "") || "#2563eb"} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} />
                <input className="input sm" style={{ width: 110 }} value={b.primaryColor ?? ""} placeholder="#2563eb" onChange={(e) => setB({ ...b, primaryColor: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className="section-label" style={{ minWidth: 70 }}>Logo</span>
                <label className="btn xs"><Upload size={12} /> Upload<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, (u) => setB((s) => ({ ...s, logoUrl: u }))); }} /></label>
                {b.logoUrl && <button className="icon-btn xs" onClick={() => setB({ ...b, logoUrl: null })} aria-label="Remove logo"><X size={12} /></button>}
              </div>
              {err && <div className="wcag-error"><AlertTriangle size={12} /> {WCAG_MSG}</div>}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary sm" disabled={pending || Boolean(err)} onClick={save}>{pending ? "Saving…" : "Save override"}</button>
                {has && <button className="btn ghost sm" disabled={pending} onClick={remove}>Remove override</button>}
              </div>
              <ActionError result={result} />
            </>
          ) : (
            <span className="cell-sub">Inherits the org-wide branding. Tick “Override” to give {entity.name} its own logo and color.</span>
          )}
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="section-label">{override ? "This entity" : "Inherited"}</span>
          <NoticePreview orgName={entity.name || orgName} logoUrl={effective.logoUrl} primaryColor={effective.primaryColor} compact />
        </div>
      </div>
    </div>
  );
}
