"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { switchRole } from "@/app/actions/session";
import type { ActorRole } from "@/lib/domain";
import { PERSONAS, productsLabel, type Persona } from "@/lib/products/people";

/**
 * Acting-as (reach-products §2.2) — the demo person switcher. It switches the
 * internal person (switcher-revision §1.2), who carries roles across products;
 * since each person maps to one Privacy role, switching here sets that role. The
 * current person is derived from the current Privacy role. Personas and the
 * products each can open come from one source (@/lib/products/people).
 */
type Person = Persona;
const PEOPLE: Person[] = PERSONAS;

export function ActingAsSwitcher({ role }: { role: ActorRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const current = PEOPLE.find((p) => p.role === role) ?? PEOPLE[0];
  const pick = (p: Person) => { setOpen(false); if (p.role === role) return; start(async () => { await switchRole(p.role); router.refresh(); }); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="row" style={{ gap: 6, alignItems: "center", background: "none", border: "1px solid var(--border)", cursor: "pointer", padding: "5px 10px", borderRadius: 8, fontSize: 12.5 }} onClick={() => setOpen((o) => !o)} aria-haspopup aria-expanded={open}>
        <span className="cell-sub">Acting as</span><strong>{current.name}</strong><span className="cell-sub">· {current.roleLabel}</span><ChevronDown size={13} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div className="popover" role="menu" style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, minWidth: 260, zIndex: 50 }}>
          <div className="popover-label">Acting as</div>
          {PEOPLE.map((p) => (
            <button key={p.name} className={`popover-row${p.role === role ? " selected" : ""}`} role="menuitemradio" aria-checked={p.role === role} onClick={() => pick(p)} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent,#2563eb)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, flexShrink: 0 }}>{p.name.split(" ").map((w) => w[0]).join("")}</span>
              <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span><span className="cell-sub">{p.roleLabel} · {productsLabel(p.role)}</span></span>
              {p.role === role && <span className="check"><Check size={15} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
