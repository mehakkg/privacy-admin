"use client";

import { MASK_CHOICES, defaultParamsForChoice, renderValue, type Masking } from "@/lib/maskingpolicy";
import { runMaskCore } from "@/lib/masking";

/**
 * Pick one of the four masking choices and tune it, with a live example on the
 * field's made-up sample value. `allow` restricts which choices appear (regulated
 * fields and "reveal more than baseline" filters pass a subset). Never shows
 * function names.
 */
export function MaskEditor({ value, onChange, sample, allow }: { value: Masking; onChange: (m: Masking) => void; sample: string; allow?: string[] }) {
  const choices = MASK_CHOICES.filter((c) => !allow || allow.includes(c.key));
  const setFamily = (family: string) => onChange({ family, params: defaultParamsForChoice(family) });
  const setParam = (k: string, v: unknown) => onChange({ ...value, params: { ...value.params, [k]: v } });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="mp-choice-grid">
        {choices.map((c) => {
          const example = runMaskCore({ family: c.key, params: defaultParamsForChoice(c.key) }, sample);
          return (
            <button key={c.key} className={`mp-choice${value.family === c.key ? " sel" : ""}`} onClick={() => setFamily(c.key)}>
              <span className="mono mp-choice-ex">{example}</span>
              <span className="cell-primary">{c.label}</span>
              <span className="cell-sub">{c.description}</span>
            </button>
          );
        })}
      </div>

      {value.family === "partial" && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="fld" style={{ width: 110 }}><span>Show first</span><input className="input" type="number" min={0} max={8} value={Number(value.params.showFirst) || 0} onChange={(e) => setParam("showFirst", Number(e.target.value))} /></label>
          <label className="fld" style={{ width: 110 }}><span>Show last</span><input className="input" type="number" min={0} max={8} value={Number(value.params.showLast) || 0} onChange={(e) => setParam("showLast", Number(e.target.value))} /></label>
        </div>
      )}
      {value.family === "pattern" && (
        <label className="fld"><span>Pattern <span className="cell-sub"># reveals a trailing character</span></span><input className="input mono" value={String(value.params.template ?? "")} onChange={(e) => setParam("template", e.target.value)} placeholder="xxxx-xxxx-####" /></label>
      )}
      {value.family === "email" && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="fld" style={{ width: 130 }}><span>Name visible first</span><input className="input" type="number" min={0} max={8} value={Number(value.params.localVisibleChars) || 0} onChange={(e) => setParam("localVisibleChars", Number(e.target.value))} /></label>
          <label className="fld" style={{ width: 130 }}><span>Name visible last</span><input className="input" type="number" min={0} max={8} value={Number(value.params.localVisibleLastChars) || 0} onChange={(e) => setParam("localVisibleLastChars", Number(e.target.value))} /></label>
        </div>
      )}

      <div className="mp-example"><span className="cell-sub">Example</span><code className="mono">{sample || "—"}</code><span className="muted">→</span><code className="mono mp-after">{renderValue(value, sample)}</code></div>
    </div>
  );
}
