"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, BookOpen } from "lucide-react";
import { MASK_CHOICES, defaultParamsForChoice, renderValue } from "@/lib/maskingpolicy";

const SAMPLES: Record<string, string> = { full: "9876543210", partial: "9876543210", pattern: "4111111111111111", email: "rajesh.kumar@example.com" };

/** "Masking functions" reference, opened from the catalog and the field drawer. */
export function MaskFunctionsDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <button className="row-link" onClick={() => setOpen(true)}><BookOpen size={15} /> Masking functions</button>
      {open && mounted && createPortal(
        <div className="modal-scrim" onClick={() => setOpen(false)}>
          <div className="modal std-modal md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="std-modal-head"><h3 style={{ margin: 0 }}>How data can be masked</h3><button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button></div>
            <div className="std-modal-body">
              <div className="stack" style={{ gap: 12 }}>
                {MASK_CHOICES.map((c) => {
                  const sample = SAMPLES[c.key];
                  return (
                    <div key={c.key} className="stack" style={{ gap: 2 }}>
                      <strong>{c.label}</strong>
                      <span className="cell-sub">{c.description}</span>
                      <span className="mono cell-sub">{sample} → {renderValue({ family: c.key, params: defaultParamsForChoice(c.key) }, sample)}</span>
                    </div>
                  );
                })}
                <p className="cell-sub" style={{ margin: 0 }}>Regulated fields can only be masked to their legal minimum or hidden completely — never shown in full.</p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
