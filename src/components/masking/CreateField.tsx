"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { MASK_METHODS, type Collision } from "@/lib/masking";
import { createFieldAction, checkCollisionAction, type MaskingActionResult } from "@/app/actions/masking";

/**
 * SCREEN 4 — Custom field creation with a live conflict pre-check.
 *
 * The code is checked against every associated regional template as it is typed.
 * A collision HARD-BLOCKS creation (confirmed product decision): prevent at
 * creation, not detect at resolve-time. The server re-checks on submit, so a stale
 * client cannot slip a colliding field through.
 */
export function CreateField({ regionalNames }: { regionalNames: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sampleValue, setSampleValue] = useState("");
  const [method, setMethod] = useState("last4");
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const seq = useRef(0);

  const normalized = code.trim().toUpperCase();
  const codeValid = /^[A-Z0-9_]+$/.test(normalized);

  // Live collision check, debounced, against the associated regional templates.
  useEffect(() => {
    if (!normalized || !codeValid) { setCollisions([]); setChecking(false); return; }
    setChecking(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { collisions } = await checkCollisionAction(normalized);
      if (mine === seq.current) { setCollisions(collisions); setChecking(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [normalized, codeValid]);

  const blocked = collisions.length > 0;
  const canCreate = !!normalized && codeValid && !!name.trim() && !blocked && !checking;

  const create = () =>
    start(async () => {
      const r = await createFieldAction({ code: normalized, name, sampleValue, method });
      setResult(r);
      if (r.ok) router.push(`/masking/fields?code=${encodeURIComponent(normalized)}`);
      else if (r.collisions) setCollisions(r.collisions);
    });

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="card-head"><h2 className="card-title">New custom field</h2></div>
      <div className="card-body">
        <p className="cell-sub" style={{ marginTop: 0 }}>
          Checked live against your associated regional {regionalNames.length === 1 ? "template" : "templates"}
          {regionalNames.length > 0 ? ` (${regionalNames.join(", ")})` : ""}, so a collision is caught here — not later, when the field silently fails to resolve.
        </p>

        <label className="fld">
          <span>Field code <span className="cell-sub">(A–Z, 0–9, underscore)</span></span>
          <input
            className="input mono"
            value={normalized}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. WALLET_ID"
            autoCapitalize="characters"
          />
        </label>
        {normalized && !codeValid && (
          <p className="cell-sub" style={{ color: "var(--red)", marginTop: -4 }}>
            A code may use only A–Z, 0–9 and underscores.
          </p>
        )}

        {/* Live check result */}
        {normalized && codeValid && (
          <div style={{ marginBottom: 8 }}>
            {checking ? (
              <span className="cell-sub">Checking associated templates…</span>
            ) : blocked ? (
              <Notice tone="danger" title="Code collision — creation blocked">
                <div>
                  {collisions.map((c) => (
                    <div key={c.ruleId} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                      <AlertTriangle size={14} style={{ color: "var(--red)" }} />
                      <span>
                        <code>{normalized}</code> is already defined by your <strong>{c.templateName}</strong> association.
                        Creating a duplicate will cause this field to fail to resolve.
                      </span>
                      <Link href={`/masking/rules/${c.ruleId}/edit`} className="row-link">
                        <Pencil size={12} style={{ verticalAlign: "-2px" }} /> Edit that item instead
                      </Link>
                    </div>
                  ))}
                </div>
              </Notice>
            ) : (
              <span className="row cell-sub" style={{ gap: 6, color: "var(--green)" }}>
                <CheckCircle2 size={14} /> No collision — this code is free.
              </span>
            )}
          </div>
        )}

        <label className="fld"><span>Field name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wallet identifier" />
        </label>
        <label className="fld"><span>Sample value <span className="cell-sub">(for the masking preview)</span></span>
          <input className="input" value={sampleValue} onChange={(e) => setSampleValue(e.target.value)} placeholder="e.g. 4002119988" />
        </label>
        <label className="fld"><span>Masking function <span className="cell-sub">(a tenant rule is created for this field)</span></span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {MASK_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>

        {result && !result.ok && (
          <div className="notice danger" style={{ marginTop: 4, marginBottom: 8 }}>
            <div className="notice-title">Refused — {result.errorKind}</div>
            <div>{result.error}</div>
          </div>
        )}

        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn primary" disabled={!canCreate || pending} onClick={create}>
            <Plus size={14} /> {pending ? "Creating…" : "Create field"}
          </button>
          {blocked && <Pill tone="red" dot={false}>Blocked by a collision</Pill>}
        </div>
      </div>
    </div>
  );
}
