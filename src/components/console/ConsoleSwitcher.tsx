"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ShieldCheck, Handshake, ScanSearch, Fingerprint } from "lucide-react";
import type { ProductKey } from "@/lib/products/deeplink";
import { SWITCH_META, SWITCH_ORDER } from "@/lib/products/switch";

const ICON: Record<ProductKey, typeof ShieldCheck> = {
  privacy: ShieldCheck,
  tprm: Handshake,
  dlp: ScanSearch,
  iam: Fingerprint,
};

/**
 * The product switcher as it appears inside the DLP / IAM consoles (and reusable
 * by any external console). Same fixed order and tick behaviour as the Privacy
 * header switcher, rendered with the dark-sidebar `.tn-ps-*` styles. Each row is
 * a link to that product's route; the current product is ticked.
 */
export function ConsoleSwitcher({ current, products }: { current: ProductKey; products: ProductKey[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);

  // Fixed order; always include the current product even if not in the set.
  const keys = SWITCH_ORDER.filter((k) => products.includes(k) || k === current);
  const cur = SWITCH_META[current];
  const CurIcon = ICON[current];
  const single = keys.length <= 1;

  return (
    <div className="tn-ps" ref={ref}>
      <button className="tn-brand tn-brand-btn" onClick={() => !single && setOpen((o) => !o)} aria-haspopup={single ? undefined : "menu"} aria-expanded={single ? undefined : open} style={{ cursor: single ? "default" : "pointer" }}>
        <span className="tn-logo" style={{ background: cur.accent }}><CurIcon size={16} /></span>
        <strong>{cur.name}</strong>
        {!single && <ChevronDown size={14} style={{ opacity: 0.7, marginLeft: "auto" }} />}
      </button>
      {open && !single && (
        <div className="tn-ps-menu" role="menu" aria-label="Switch product">
          <div className="tn-ps-label">Switch product</div>
          {keys.map((k) => {
            const m = SWITCH_META[k];
            const Icon = ICON[k];
            const isCurrent = k === current;
            const Row: React.ElementType = isCurrent ? "div" : "a";
            return (
              <Row key={k} {...(isCurrent ? {} : { href: m.route })} className={`tn-ps-row${isCurrent ? " selected" : ""}`} role="menuitemradio" aria-checked={isCurrent}>
                <span className="tn-ps-dot" style={{ background: m.accent }}><Icon size={14} /></span>
                <span className="stack" style={{ gap: 0 }}><strong>{m.name}</strong><span className="tn-ps-sub">{m.desc}</span></span>
                {isCurrent && <span className="tn-ps-check">✓</span>}
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
