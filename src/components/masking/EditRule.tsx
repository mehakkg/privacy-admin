"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, GitBranchPlus, RefreshCw, AlertTriangle, EyeOff } from "lucide-react";
import { Pill } from "@/components/ui";
import { runMaskCore, MASK_METHODS, METHOD_LABEL, tierBadge, TIER_TONE, type MaskResult } from "@/lib/masking";
import { saveRuleAction, simulateConcurrentEditAction, type MaskingActionResult } from "@/app/actions/masking";

/**
 * SCREEN 3 — Edit Rule with optimistic locking.
 *
 * The form loads at a known version. Save submits that version; if it has moved,
 * the server rejects the write (nothing is overwritten) and we render a SPECIFIC
 * conflict — what changed, by whom — not a generic "please retry". The live
 * preview runs the real ddm-masking-core function; a tenant custom function shows
 * the honest CUSTOM_FUNCTION_NOT_EXECUTABLE_BY_PDP state instead of a fake output.
 */
export function EditRule({
  ruleId,
  fieldCode,
  fieldName,
  sampleValue,
  templateName,
  tier,
  initialMethod,
  initialVersion,
}: {
  ruleId: string;
  fieldCode: string;
  fieldName: string;
  sampleValue: string;
  templateName: string;
  tier: string;
  initialMethod: string;
  initialVersion: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState(initialMethod);
  // Captured at load and advanced only on our own successful save — a simulated
  // concurrent edit deliberately does NOT touch it, which is what surfaces a conflict.
  const [loadedVersion, setLoadedVersion] = useState(initialVersion);
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [saved, setSaved] = useState(false);

  const preview: MaskResult = runMaskCore(method, sampleValue);
  const dirty = method !== initialMethod;

  const save = () =>
    start(async () => {
      setSaved(false);
      const r = await saveRuleAction(ruleId, loadedVersion, method);
      setResult(r);
      if (r.ok) {
        setLoadedVersion((v) => v + 1);
        setSimulated(false);
        setSaved(true);
        router.refresh();
      }
    });

  const simulate = () =>
    start(async () => {
      const r = await simulateConcurrentEditAction(ruleId);
      // Keep loadedVersion stale on purpose; don't refresh the form.
      if (r.ok) { setSimulated(true); setResult(null); setSaved(false); }
    });

  const reloadLatest = () =>
    start(async () => {
      router.refresh();
      // Remount will re-seed initialVersion; reset local state to match.
      setResult(null);
      setSimulated(false);
    });

  return (
    <div className="split-2">
      {/* Left — the rule definition form */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title row" style={{ gap: 8 }}>
            {fieldName} <span className="cell-sub mono">{fieldCode}</span>
          </h2>
          <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
            <Pill tone={TIER_TONE[tier]} dot={false}>{tierBadge(tier, templateName)}</Pill>
            <Pill tone="gray" dot={false}>v{loadedVersion}</Pill>
          </div>
        </div>
        <div className="card-body">
          {result?.errorKind === "ConflictError" && result.conflict && (
            <div className="notice danger" style={{ marginBottom: 12 }}>
              <div className="notice-title row" style={{ gap: 6 }}>
                <AlertTriangle size={15} /> Save rejected — concurrent edit
              </div>
              <div>
                This rule was changed by <strong>{result.conflict.changedBy ?? "another admin"}</strong>
                {result.conflict.changedAt ? ` at ${result.conflict.changedAt}` : ""} and is now version{" "}
                <strong>{result.conflict.currentVersion}</strong>
                {result.conflict.currentMethod ? ` (method: ${METHOD_LABEL[result.conflict.currentMethod] ?? result.conflict.currentMethod})` : ""}.
                Your change was <strong>not</strong> applied — nothing was overwritten. Reload the latest
                definition, then re-apply your edit if it still makes sense.
              </div>
              <button className="btn sm" style={{ marginTop: 10 }} disabled={pending} onClick={reloadLatest}>
                <RefreshCw size={13} /> Reload latest
              </button>
            </div>
          )}
          {result && !result.ok && result.errorKind !== "ConflictError" && (
            <div className="notice danger" style={{ marginBottom: 12 }}>
              <div className="notice-title">Refused — {result.errorKind}</div>
              <div>{result.error}</div>
            </div>
          )}
          {saved && (
            <div className="notice ok" style={{ marginBottom: 12 }}>
              <div className="notice-title">Saved</div>
              <div>The masking rule for {fieldCode} is now version {loadedVersion}.</div>
            </div>
          )}

          <label className="fld">
            <span>Masking function</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {MASK_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <p className="cell-sub" style={{ marginTop: -4 }}>
            {MASK_METHODS.find((m) => m.key === method)?.blurb}
          </p>

          <label className="fld">
            <span>Sample value <span className="cell-sub">(used for the preview)</span></span>
            <input className="input" value={sampleValue} readOnly />
          </label>

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn primary" disabled={pending || !dirty} onClick={save}>
              <Save size={14} /> {pending ? "Saving…" : "Save"}
            </button>
            <button className="btn ghost sm" disabled={pending} onClick={simulate} title="Demo: bump the version server-side as if another admin saved, so the optimistic-lock conflict can be shown on demand.">
              <GitBranchPlus size={13} /> Simulate a concurrent edit
            </button>
          </div>
          {simulated && (
            <p className="cell-sub" style={{ marginTop: 8, color: "var(--yellow)" }}>
              A concurrent edit was recorded server-side. Your form still holds v{loadedVersion} — press Save to see the conflict.
            </p>
          )}
        </div>
      </div>

      {/* Right — live preview panel */}
      <div className="card">
        <div className="card-head"><h2 className="card-title">Live preview</h2></div>
        <div className="card-body">
          {preview.ok ? (
            <>
              <div className="mask-preview">
                <code className="mask-before">{sampleValue}</code>
                <span className="muted">→</span>
                <code className="mask-after">{preview.output}</code>
              </div>
              <p className="cell-sub" style={{ marginTop: 10 }}>
                Executed by ddm-masking-core against the sample value — this is the real function output,
                not a mock-up.
              </p>
            </>
          ) : (
            <div className="lock-box degraded">
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <EyeOff size={16} className="muted" />
                <Pill tone="gray" dot={false}>{preview.code}</Pill>
              </div>
              <p className="cell-sub" style={{ margin: "8px 0 0" }}>{preview.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
