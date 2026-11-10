"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, ShieldCheck, Handshake, ScanSearch, Fingerprint } from "lucide-react";
import type { ActorRole } from "@/lib/domain";
import { productsFor } from "@/lib/products/people";
import { routeFor } from "@/lib/products/switch";
import type { ProductKey } from "@/lib/products/deeplink";

/**
 * Four-product switcher (switcher-revision §1). The trigger is the current
 * product (always Privacy here); the menu lists only the products this person
 * can open, in the FIXED order Privacy · TPRM · DLP · IAM — the ✓ marks the
 * current one and never reorders. Switching opens that product's home in the
 * same tab; a product whose portal isn't connected opens a holding page.
 *
 * Privacy (blue) and TPRM (orange) are brand colours. DLP and IAM render a
 * neutral placeholder tile until their owners supply a mark.
 * // TODO brand from DLP/IAM owner — replace the neutral tile + colour below.
 */
type Meta = { key: ProductKey; name: string; desc: string; icon: typeof ShieldCheck; accent: string };
const META: Record<ProductKey, Meta> = {
  privacy: { key: "privacy", name: "miniOrange Privacy", desc: "Register, consent, rights and breaches", icon: ShieldCheck, accent: "#2563eb" },
  tprm: { key: "tprm", name: "miniOrange TPRM", desc: "Vendor risk, assessments and monitoring", icon: Handshake, accent: "#ea580c" },
  dlp: { key: "dlp", name: "miniOrange DLP", desc: "Data discovery, classification and policies", icon: ScanSearch, accent: "#64748b" },
  iam: { key: "iam", name: "miniOrange IAM", desc: "Identity, sign-in and access", icon: Fingerprint, accent: "#64748b" },
};

export function ProductSwitcher({ role }: { role: ActorRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const keys = productsFor(role);
  const products = keys.map((k) => META[k]);
  const current = META.privacy;
  const single = products.length <= 1;

  // Privacy stays here; TPRM / DLP / IAM each open their in-repo console prototype.
  const go = (key: ProductKey) => {
    setOpen(false);
    if (key === "privacy") return;
    router.push(routeFor(key));
  };

  // Keyboard: Esc closes; Up/Down move between rows (switcher-revision §1.1).
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const rows = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? []);
      const i = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
      rows[next]?.focus();
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="product-switcher-trigger row" style={{ gap: 8, alignItems: "center", background: "none", border: 0, cursor: single ? "default" : "pointer", padding: "4px 6px", borderRadius: 8 }} onClick={() => !single && setOpen((o) => !o)} aria-haspopup={single ? undefined : "menu"} aria-expanded={single ? undefined : open}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: current.accent, display: "grid", placeItems: "center", color: "#fff" }}><ShieldCheck size={15} strokeWidth={2} /></span>
        <strong style={{ fontSize: 14 }}>{current.name}</strong>
        {!single && <ChevronDown size={15} style={{ opacity: 0.6 }} />}
      </button>
      {open && !single && (
        <div ref={menuRef} className="popover" role="menu" aria-label="Switch product" onKeyDown={onMenuKey} style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: 320, zIndex: 50 }}>
          <div className="popover-label">Switch product</div>
          {products.map((p) => {
            const Icon = p.icon;
            const isCurrent = p.key === "privacy";
            return (
              <button key={p.key} className={`popover-row${isCurrent ? " selected" : ""}`} role="menuitemradio" aria-checked={isCurrent} onClick={() => go(p.key)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: p.accent, display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}><Icon size={16} /></span>
                <span className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span><span className="cell-sub">{p.desc}</span></span>
                {isCurrent && <span className="check"><Check size={15} /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
