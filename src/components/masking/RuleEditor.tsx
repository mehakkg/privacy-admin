"use client";

import {
  FAMILIES, ruleLabel, runMaskCore, meetsFloor, STRICTNESS_RANK,
  type Family, type Rule,
} from "@/lib/masking";

export function defaultParamsFor(family: string): Record<string, unknown> {
  switch (family) {
    case "partial": return { showFirst: 0, showLast: 4, maskChar: "*" };
    case "pattern": return { template: "****-####" };
    case "email": return { localVisibleChars: 2, localVisibleLastChars: 2, domainMode: "PRESERVE" };
    default: return {};
  }
}

/**
 * Reusable rule editor: family + params + live preview, with the floor rule
 * enforced. Options weaker than the floor are DISABLED with an inline reason —
 * never silently clamped. Synthetic is offered only on the Non-prod channel.
 */
export function RuleEditor({
  value, onChange, floor, floorName, channel, sampleValue,
}: {
  value: Rule;
  onChange: (r: Rule) => void;
  floor: Rule | null;
  floorName: string | null;
  channel: string | null;
  sampleValue: string;
}) {
  const setFamily = (family: string) => onChange({ family, params: defaultParamsFor(family) });
  const setParam = (k: string, v: unknown) => onChange({ ...value, params: { ...value.params, [k]: v } });

  const floorRank = floor ? STRICTNESS_RANK[floor.family] ?? 0 : 0;
  const familyDisabled = (f: Family) => {
    if (FAMILIES.find((x) => x.key === f)?.onlyChannel && FAMILIES.find((x) => x.key === f)!.onlyChannel !== channel) return "Channel-only";
    if (floor && (STRICTNESS_RANK[f] ?? 0) < floorRank) return `Weaker than the ${floorName ?? "floor"} (${ruleLabel(floor)})`;
    return null;
  };

  const belowFloor = floor ? !meetsFloor(value, floor) : false;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="fld">
        <span>Masking function</span>
        <select className="input" value={value.family} onChange={(e) => setFamily(e.target.value)}>
          {FAMILIES.map((f) => {
            const reason = familyDisabled(f.key);
            return <option key={f.key} value={f.key} disabled={!!reason && value.family !== f.key}>{f.label}{reason ? ` — ${reason}` : ""}</option>;
          })}
        </select>
      </label>

      {value.family === "partial" && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="fld" style={{ width: 110 }}><span>Show first</span>
            <input className="input" type="number" min={0} max={8} value={Number(value.params.showFirst) || 0} onChange={(e) => setParam("showFirst", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 110 }}><span>Show last</span>
            <input className="input" type="number" min={0} max={8} value={Number(value.params.showLast) || 0} onChange={(e) => setParam("showLast", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 90 }}><span>Mask char</span>
            <input className="input" maxLength={1} value={String(value.params.maskChar ?? "*")} onChange={(e) => setParam("maskChar", e.target.value || "*")} />
          </label>
        </div>
      )}
      {value.family === "pattern" && (
        <label className="fld"><span>Template <span className="cell-sub"># reveals a trailing character; other characters are literal</span></span>
          <input className="input mono" value={String(value.params.template ?? "")} onChange={(e) => setParam("template", e.target.value)} placeholder="xxxx-xxxx-####" />
        </label>
      )}
      {value.family === "email" && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="fld" style={{ width: 130 }}><span>Local visible first</span>
            <input className="input" type="number" min={0} max={8} value={Number(value.params.localVisibleChars) || 0} onChange={(e) => setParam("localVisibleChars", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 130 }}><span>Local visible last</span>
            <input className="input" type="number" min={0} max={8} value={Number(value.params.localVisibleLastChars) || 0} onChange={(e) => setParam("localVisibleLastChars", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 140 }}><span>Domain</span>
            <select className="input" value={String(value.params.domainMode ?? "PRESERVE")} onChange={(e) => setParam("domainMode", e.target.value)}>
              <option value="PRESERVE">PRESERVE</option><option value="MASK">MASK</option>
            </select>
          </label>
        </div>
      )}
      {value.family === "full" && <p className="cell-sub">Every character is masked.</p>}
      {value.family === "format" && <p className="cell-sub">Each character is swapped for one of the same type, so length and shape are kept and the real value is gone.</p>}
      {value.family === "hash" && <p className="cell-sub">The value becomes a fixed, irreversible token. It can never be turned back into the original.</p>}
      {value.family === "redact" && <p className="cell-sub">The value is dropped entirely — nothing is shown in its place.</p>}

      <div className="mask-preview sm">
        <code className="mask-before">{sampleValue || "—"}</code>
        <span className="muted">→</span>
        <code className="mask-after">{sampleValue ? (runMaskCore(value, sampleValue) || "(removed)") : "—"}</code>
      </div>
      {belowFloor && (
        <p className="cell-sub" style={{ color: "var(--red)" }}>
          Weaker than the {floorName ?? "floor"} ({ruleLabel(floor!)}). A higher layer can only tighten.
        </p>
      )}
    </div>
  );
}
