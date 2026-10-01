"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X, Lock, LayoutTemplate, User } from "lucide-react";
import { FAMILIES, REVEAL, intentPreview } from "@/lib/masking";

/**
 * "Rule guide" — a reference modal explaining how Protection rules resolve, the
 * masking methods available, what needs approval, and what each field state
 * means. Opens from the page header; portaled to body.
 */
export function RuleGuide() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const methods = [
    ...FAMILIES.map((f) => ({ key: f.key, label: f.label, description: f.description, reversible: f.reversible })),
    { key: REVEAL, label: "Show in full", description: "No masking — the value is shown as-is. Hidden for sensitive or regulated fields.", reversible: true },
  ];

  return (
    <>
      <button className="row-link" style={{ gap: 6, alignItems: "center" }} onClick={() => setOpen(true)}><BookOpen size={15} /> Rule guide</button>
      {open && mounted && createPortal(
        <div className="modal-scrim" onClick={() => setOpen(false)}>
          <div className="modal std-modal lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Rule guide">
            <div className="std-modal-head">
              <h3 style={{ margin: 0 }}>Rule guide</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="std-modal-body">
              <div className="stack" style={{ gap: 18 }}>

                <section className="stack" style={{ gap: 6 }}>
                  <h4 className="guide-h">How a field resolves</h4>
                  <p className="cell-sub" style={{ margin: 0 }}>Every field gets its effective rule from the highest layer that defines it:</p>
                  <div className="guide-chain">
                    <span className="guide-layer"><User size={12} /> Your tenant rule</span>
                    <span className="guide-arrow">beats</span>
                    <span className="guide-layer"><LayoutTemplate size={12} /> Regional / custom template</span>
                    <span className="guide-arrow">beats</span>
                    <span className="guide-layer"><Lock size={12} /> Baseline floor</span>
                  </div>
                  <p className="cell-sub" style={{ margin: 0 }}>Baseline is a floor: a higher layer may only make masking <strong>equal or stricter</strong>, never weaker. If two non-baseline templates claim the same field, it is flagged <strong>Ambiguous</strong> rather than guessing a winner.</p>
                </section>

                <section className="stack" style={{ gap: 8 }}>
                  <h4 className="guide-h">Masking methods</h4>
                  <div className="table-wrap"><table className="dtable compact">
                    <thead><tr><th>Method</th><th>What it does</th><th>Example</th><th>Reversible</th></tr></thead>
                    <tbody>
                      {methods.map((m) => {
                        const ex = intentPreview(m.key);
                        return (
                          <tr key={m.key}>
                            <td><strong>{m.label}</strong></td>
                            <td className="cell-sub">{m.description}</td>
                            <td className="mono cell-sub">{ex ? `${ex.before} → ${ex.after}` : "—"}</td>
                            <td className="cell-sub">{m.reversible ? "Yes" : "No"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                  <p className="cell-sub" style={{ margin: 0 }}>Methods are shown in plain language throughout — the underlying functions are never exposed.</p>
                </section>

                <section className="stack" style={{ gap: 8 }}>
                  <h4 className="guide-h">What needs approval</h4>
                  <ul className="guide-list">
                    <li><strong>Applies immediately:</strong> creating the first rule on a field that has none; switching an override <em>off</em> (it falls through to the template/Baseline).</li>
                    <li><strong>Goes to the DPO:</strong> overriding a template, editing an existing tenant rule, turning an override back <em>on</em>, or adding a role/channel view — regardless of how small the change looks. Approval routing is computed from the field&rsquo;s state; there is no toggle to skip it.</li>
                    <li><strong>Never possible:</strong> changing a platform-owned field (Aadhaar, PAN, ABHA).</li>
                  </ul>
                </section>

                <section className="stack" style={{ gap: 8 }}>
                  <h4 className="guide-h">Field states</h4>
                  <ul className="guide-list">
                    <li><strong>No rule</strong> — not masked anywhere; create a rule to protect it.</li>
                    <li><strong>Baseline / Template-governed</strong> — governed by a shared template; changes are proposals.</li>
                    <li><strong>Tenant</strong> — your own rule governs it; edit, duplicate, move, restore or delete it.</li>
                    <li><strong>Override off</strong> — your rule is kept but inactive; the field resolves to the template value live.</li>
                    <li><strong>Platform-owned</strong> — a permanent regulatory floor; no tenant can change it.</li>
                    <li><strong>Ambiguous</strong> — two templates collide; resolve the collision before a rule applies.</li>
                  </ul>
                </section>

                <section className="stack" style={{ gap: 6 }}>
                  <h4 className="guide-h">Role &amp; channel views</h4>
                  <p className="cell-sub" style={{ margin: 0 }}>You can define how a field appears to a specific role or channel, but enforcement is <strong>not yet active at the API</strong>. Until it is, every request resolves to the <strong>Default</strong> view — these settings are stored and governed, not live.</p>
                </section>

              </div>
            </div>
            <div className="std-modal-foot">
              <button className="btn primary" onClick={() => setOpen(false)}>Got it</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
