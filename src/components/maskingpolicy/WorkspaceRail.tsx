"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal } from "lucide-react";
import { addAudienceAction, renameAudienceAction, removeAudienceAction } from "@/app/actions/maskingpolicy";

const MP = "/data-flow/masking-policy";
export interface RailItem { kind: "item" | "label" | "divider" | "review"; key: string; label?: string; status?: string; accent?: boolean; focus?: string; current?: boolean; audienceId?: string }

export function WorkspaceRail({ items, vid }: { items: RailItem[]; vid: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState(""); const [ident, setIdent] = useState("");
  const [, start] = useTransition();

  return (
    <nav className="mp-rail">
      {items.map((it) => {
        if (it.kind === "divider") return <div key={it.key} className="mp-rail-divider" />;
        if (it.kind === "label") return <div key={it.key} className="mp-rail-label">{it.label}</div>;
        const href = it.kind === "review" ? `${MP}?view=review` : `${MP}?view=workspace&focus=${it.focus}`;
        return (
          <div key={it.key} className={`mp-rail-item${it.current ? " current" : ""}`}>
            <Link href={href} className="mp-rail-link">
              <span>{it.label}</span>
              {it.status && <span className={`mp-rail-status${it.accent ? " accent" : ""}`}>{it.status}</span>}
            </Link>
            {it.audienceId && <AudienceMenu audienceId={it.audienceId} label={it.label ?? ""} onDone={() => router.refresh()} />}
          </div>
        );
      })}
      {adding ? (
        <div className="mp-rail-add">
          <input className="input sm" placeholder="Name, e.g. Teller" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input sm" placeholder="How your app names this role" value={ident} onChange={(e) => setIdent(e.target.value)} />
          <div className="row" style={{ gap: 4 }}>
            <button className="btn primary sm" disabled={!label.trim() || !ident.trim()} onClick={() => start(async () => { const r = await addAudienceAction(vid, label, ident); setAdding(false); setLabel(""); setIdent(""); if (r.ok && r.id) router.push(`${MP}?view=workspace&focus=audience:${r.id}`); else router.refresh(); })}>Add</button>
            <button className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : <button className="mp-rail-link add" onClick={() => setAdding(true)}><Plus size={13} /> Add audience</button>}
    </nav>
  );
}

function AudienceMenu({ audienceId, label, onDone }: { audienceId: string; label: string; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "remove">("menu");
  const [name, setName] = useState(label);
  const ref = useRef<HTMLDivElement>(null);
  const [, start] = useTransition();
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setMode("menu"); } }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [open]);
  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn sm" aria-label={`${label} options`} onClick={() => setOpen((o) => !o)}><MoreHorizontal size={14} /></button>
      {open && (
        <div className="row-menu-pop" style={{ position: "absolute", top: "100%", right: 0, minWidth: 200 }}>
          {mode === "menu" && <>
            <button className="row-menu-item" onClick={() => setMode("rename")}>Rename</button>
            <button className="row-menu-item danger" onClick={() => setMode("remove")}>Remove</button>
          </>}
          {mode === "rename" && <div className="row-menu-confirm"><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} /><div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn primary sm" onClick={() => start(async () => { await renameAudienceAction(audienceId, name); setOpen(false); onDone(); })}>Save</button><button className="btn ghost sm" onClick={() => setMode("menu")}>Cancel</button></div></div>}
          {mode === "remove" && <div className="row-menu-confirm">Remove {label} and its exceptions?<div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn danger sm" onClick={() => start(async () => { await removeAudienceAction(audienceId); setOpen(false); router.push("/data-flow/masking-policy?view=workspace&focus=everyone"); })}>Remove</button><button className="btn ghost sm" onClick={() => setMode("menu")}>Cancel</button></div></div>}
        </div>
      )}
    </div>
  );
}
