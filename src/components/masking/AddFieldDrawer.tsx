"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { RuleEditor } from "@/components/masking/RuleEditor";
import { CHANNELS, SENSITIVITIES, ruleLabel, type Rule, type Collision } from "@/lib/masking";
import { createFieldAction, checkCollisionAction, type MaskingActionResult } from "@/app/actions/masking";

/** SCREEN 1b — Add field drawer: three sections (not a wizard), live collision pre-check. */
export function AddFieldDrawer({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sensitivity, setSensitivity] = useState("Personal");
  const [pattern, setPattern] = useState("");
  const [elementRef, setElementRef] = useState("");
  const [sampleValue, setSampleValue] = useState("");
  const [rule, setRule] = useState<Rule>({ family: "partial", params: { showLast: 4, maskChar: "*" } });
  const [overrides, setOverrides] = useState<Record<string, Rule | null>>({});
  const [openCh, setOpenCh] = useState<string | null>(null);
  const [collision, setCollision] = useState<Collision | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const normalized = code.trim().toUpperCase();
  const codeValid = /^[A-Z0-9_]+$/.test(normalized);

  useEffect(() => {
    if (!normalized || !codeValid) { setCollision(null); setChecking(false); return; }
    setChecking(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { collision } = await checkCollisionAction(normalized);
      if (mine === seq.current) { setCollision(collision); setChecking(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [normalized, codeValid]);

  const close = () => router.push(closeHref);

  const create = async () => {
    setBusy(true);
    const channelOverrides = Object.entries(overrides)
      .filter(([, r]) => r)
      .map(([channel, r]) => ({ channel, family: r!.family, params: r!.params }));
    const r = await createFieldAction({ code: normalized, name, sensitivity, detectionPattern: pattern, dataElementRef: elementRef, sampleValue, defaultRule: { family: rule.family, params: rule.params }, channelOverrides });
    setResult(r);
    setBusy(false);
    if (r.ok) router.push(`/data-flow/protection-rules?tab=by-field&field=${encodeURIComponent(normalized)}&created=1`);
  };

  return (
    <>
      <div className="mask-drawer-scrim" onClick={close} />
      <aside className="mask-drawer" role="dialog" aria-label="Add field">
        <div className="mask-drawer-head">
          <div className="stack" style={{ gap: 2 }}><span className="cell-primary">Add field</span><span className="cell-sub">Checked against your DPDP and RBI templates as you type.</span></div>
          <button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="mask-drawer-body">
          {result && !result.ok && <div className="notice danger" style={{ marginBottom: 10 }}><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>}

          <section className="mask-drawer-section">
            <h3 className="mask-section-title">Define the field</h3>
            <label className="fld"><span>Field code <span className="cell-sub">A–Z, 0–9, underscore</span></span>
              <input className="input mono" value={normalized} onChange={(e) => setCode(e.target.value)} placeholder="WALLET_ID" />
            </label>
            {normalized && !codeValid && <p className="cell-sub" style={{ color: "var(--red)", marginTop: -4 }}>Only A–Z, 0–9 and underscores.</p>}
            {normalized && codeValid && (
              checking ? <p className="cell-sub">Checking templates…</p>
              : collision ? (
                <div className="notice danger">
                  <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                    <AlertTriangle size={14} style={{ color: "var(--red)", marginTop: 2 }} />
                    <span>{normalized} is already governed by the {collision.templateName}{collision.ruleLabel ? `. Its rule is ${collision.ruleLabel}.` : "."} Your tenant rule can only be equal or stricter.
                      {" "}<Link href={`/data-flow/protection-rules?tab=by-field&field=${normalized}`} className="row-link"><Pencil size={11} style={{ verticalAlign: -1 }} /> Edit that item instead</Link>
                    </span>
                  </div>
                </div>
              ) : <p className="row cell-sub" style={{ gap: 6, color: "var(--green)" }}><CheckCircle2 size={14} /> Code is free.</p>
            )}
            <label className="fld"><span>Field name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet identifier" /></label>
            <div className="fld"><span>Sensitivity</span>
              <div className="seg">{SENSITIVITIES.map((s) => <button key={s} className={`seg-btn${sensitivity === s ? " active" : ""}`} onClick={() => setSensitivity(s)}>{s}</button>)}</div>
            </div>
            <label className="fld"><span>Detection pattern <span className="cell-sub">(optional)</span></span><input className="input mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="^W-\d{6}$" /><span className="cell-sub">Used by discovery to find this field in connected sources.</span></label>
            <label className="fld"><span>Linked data element <span className="cell-sub">(optional)</span></span><input className="input" value={elementRef} onChange={(e) => setElementRef(e.target.value)} placeholder="RoPA data element" /></label>
          </section>

          <section className="mask-drawer-section">
            <h3 className="mask-section-title">Default rule</h3>
            <label className="fld"><span>Sample value</span><input className="input" value={sampleValue} onChange={(e) => setSampleValue(e.target.value)} placeholder="W-771203" /></label>
            <RuleEditor value={rule} onChange={setRule} floor={null} floorName={null} channel={null} sampleValue={sampleValue} />
          </section>

          <section className="mask-drawer-section">
            <h3 className="mask-section-title">Channel overrides <span className="cell-sub">(optional)</span></h3>
            <div className="stack" style={{ gap: 4 }}>
              {CHANNELS.map((c) => {
                const ov = overrides[c.key];
                const isOpen = openCh === c.key;
                return (
                  <div key={c.key} className="chan-override">
                    <button className="row chan-override-head" onClick={() => setOpenCh(isOpen ? null : c.key)} style={{ width: "100%", justifyContent: "space-between" }}>
                      <span className="row" style={{ gap: 6 }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {c.label}</span>
                      <span className="cell-sub">{ov ? ruleLabel(ov) : "Uses default"}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "8px 4px 4px" }}>
                        {ov ? (
                          <>
                            <RuleEditor value={ov} onChange={(r) => setOverrides({ ...overrides, [c.key]: r })} floor={{ family: rule.family, params: rule.params }} floorName="default rule" channel={c.key} sampleValue={sampleValue} />
                            <button className="link-btn" style={{ marginTop: 6 }} onClick={() => setOverrides({ ...overrides, [c.key]: null })}>Remove override — use default</button>
                          </>
                        ) : (
                          <button className="btn ghost sm" onClick={() => setOverrides({ ...overrides, [c.key]: { family: rule.family, params: { ...rule.params } } })}>Override this channel</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div className="mask-drawer-foot">
          <button className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={busy || !!collision} onClick={create}>{busy ? "Creating…" : "Create field"}</button>
        </div>
      </aside>
    </>
  );
}
