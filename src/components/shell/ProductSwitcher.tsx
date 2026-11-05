"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, ShieldCheck, Fingerprint, ScanSearch, Handshake } from "lucide-react";
import type { ActorRole } from "@/lib/domain";

/**
 * Four-product switcher (reach-products §2.1). The trigger is the current product;
 * the menu lists only the products this person can open, in a fixed order, with
 * the current one ticked. Switching opens that product's home in the same tab;
 * a product whose portal URL isn't configured opens a holding page, never a 404.
 */
type ProductKey = "privacy" | "iam" | "dlp" | "tprm";
const PRODUCTS: { key: ProductKey; name: string; desc: string; icon: typeof ShieldCheck; accent: string }[] = [
  { key: "privacy", name: "miniOrange Privacy", desc: "Register, consent, rights and breaches", icon: ShieldCheck, accent: "#2563eb" },
  { key: "iam", name: "miniOrange IAM", desc: "Identity, sign-in and access", icon: Fingerprint, accent: "#7c3aed" },
  { key: "dlp", name: "miniOrange DLP", desc: "Data discovery, classification and policies", icon: ScanSearch, accent: "#0891b2" },
  { key: "tprm", name: "miniOrange TPRM", desc: "Vendor risk, assessments and monitoring", icon: Handshake, accent: "#ea580c" },
];

/** Which products a person can open, by their Privacy role (fixture §10). */
function visibleFor(role: ActorRole): ProductKey[] {
  if (role === "admin") return ["privacy", "iam", "dlp", "tprm"];
  if (role === "dpo") return ["privacy", "tprm"];
  return ["privacy"];
}

export function ProductSwitcher({ role }: { role: ActorRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const visible = visibleFor(role);
  const products = PRODUCTS.filter((p) => visible.includes(p.key));
  const current = PRODUCTS[0];
  const single = products.length === 1;

  // TPRM has a working nav prototype in this repo; the other portals aren't
  // connected, so they open the holding page.
  const go = (key: ProductKey) => {
    setOpen(false);
    if (key === "privacy") return;
    router.push(key === "tprm" ? "/tprm-console" : `/switch/${key}`);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="product-switcher-trigger row" style={{ gap: 8, alignItems: "center", background: "none", border: 0, cursor: single ? "default" : "pointer", padding: "4px 6px", borderRadius: 8 }} onClick={() => !single && setOpen((o) => !o)} aria-haspopup={!single} aria-expanded={open}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: current.accent, display: "grid", placeItems: "center", color: "#fff" }}><ShieldCheck size={15} strokeWidth={2} /></span>
        <strong style={{ fontSize: 14 }}>{current.name}</strong>
        {!single && <ChevronDown size={15} style={{ opacity: 0.6 }} />}
      </button>
      {open && !single && (
        <div className="popover" role="menu" style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: 320, zIndex: 50 }}>
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
