"use client";

import {
  FAMILIES, GENERALIZE_BUCKETS, ruleLabel, runMaskCore, meetsFloor, STRICTNESS_RANK,
  type Family, type Rule,
} from "@/lib/masking";

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
  const setFamily = (family: string) => {
    const params: Record<string, unknown> =
      family === "partial" ? { revealLast: 4, maskChar: "*" }
      : family === "generalize" ? { bucket: "age5" }
      : family === "hash" ? { algorithm: "SHA-256" }
      : family === "tokenize" ? { vault: "default" }
      : family === "fpe" ? { preserve: "digits" }
      : family === "synthetic" ? { generator: "synthetic" }
      : {};
    onChange({ family, params });
  };
  const setParam = (k: string, v: unknown) => onChange({ ...value, params: { ...value.params, [k]: v } });

  const floorRank = floor ? STRICTNESS_RANK[floor.family as Family] ?? 0 : 0;
  const familyDisabled = (f: Family) => {
    if (FAMILIES.find((x) => x.key === f)?.onlyChannel && FAMILIES.find((x) => x.key === f)!.onlyChannel !== channel) return "Non-prod only";
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
          <label className="fld" style={{ width: 110 }}><span>Reveal first</span>
            <input className="input" type="number" min={0} max={6} value={Number(value.params.revealFirst) || 0} onChange={(e) => setParam("revealFirst", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 110 }}><span>Reveal last</span>
            <input className="input" type="number" min={0} max={6} value={Number(value.params.revealLast) || 0} onChange={(e) => setParam("revealLast", Number(e.target.value))} />
          </label>
          <label className="fld" style={{ width: 90 }}><span>Mask char</span>
            <input className="input" maxLength={1} value={String(value.params.maskChar ?? "*")} onChange={(e) => setParam("maskChar", e.target.value || "*")} />
          </label>
          <label className="fld" style={{ alignSelf: "flex-end" }}>
            <span className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!value.params.preserveDomain} onChange={(e) => setParam("preserveDomain", e.target.checked)} /> Preserve email domain</span>
          </label>
        </div>
      )}
      {value.family === "generalize" && (
        <label className="fld"><span>Bucket</span>
          <select className="input" value={String(value.params.bucket ?? "age5")} onChange={(e) => setParam("bucket", e.target.value)}>
            {Object.entries(GENERALIZE_BUCKETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      {value.family === "fpe" && (
        <label className="fld"><span>Preserve</span>
          <select className="input" value={String(value.params.preserve ?? "digits")} onChange={(e) => setParam("preserve", e.target.value)}>
            <option value="digits">digits</option><option value="letters">letters</option><option value="separators">separators</option>
          </select>
        </label>
      )}
      {value.family === "hash" && <p className="cell-sub">Algorithm: SHA-256 · irreversible.</p>}
      {value.family === "tokenize" && <p className="cell-sub">Vault: default · reversible with authority.</p>}
      {value.family === "full" && <p className="cell-sub">The whole value is redacted · irreversible.</p>}
      {value.family === "synthetic" && <p className="cell-sub">Realistic fake data · Non-prod only.</p>}

      <div className="mask-preview sm">
        <code className="mask-before">{sampleValue || "—"}</code>
        <span className="muted">→</span>
        <code className="mask-after">{sampleValue ? runMaskCore(value, sampleValue) : "—"}</code>
      </div>
      {belowFloor && (
        <p className="cell-sub" style={{ color: "var(--red)" }}>
          Weaker than the {floorName ?? "floor"} ({ruleLabel(floor!)}). A higher layer can only tighten.
        </p>
      )}
    </div>
  );
}
