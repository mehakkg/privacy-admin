"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal } from "lucide-react";
import { AddAudienceTrigger } from "@/components/maskingpolicy/WorkspaceMenus";
import { renameAudienceAction, removeAudienceAction, changeAudienceIdentifierAction } from "@/app/actions/maskingpolicy";

const MP = "/data-flow/masking-policy";
export interface RailItem { kind: "item" | "label" | "divider" | "review"; key: string; label?: string; status?: string; accent?: boolean; focus?: string; current?: boolean; audienceId?: string }

export function WorkspaceRail({ items, vid }: { items: RailItem[]; vid: string }) {
  const router = useRouter();
  const noAudiences = items.filter((i) => i.audienceId).length === 0;

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
      <AddAudienceTrigger draftId={vid} className="mp-rail-link add"><Plus size={13} /> Add audience</AddAudienceTrigger>
      {noAudiences && <div className="mp-rail-example">For example: Teller, Branch manager, Fraud investigator.</div>}
    </nav>
  );
}

function AudienceMenu({ audienceId, label, onDone }: { audienceId: string; label: string; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "ident" | "remove">("menu");
  const [name, setName] = useState(label);
  const [ident, setIdent] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [, start] = useTransition();
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setMode("menu"); } }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [open]);
  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn sm" aria-label={`${label} options`} onClick={() => setOpen((o) => !o)}><MoreHorizontal size={14} /></button>
      {open && (
        <div className="row-menu-pop" style={{ position: "absolute", top: "100%", right: 0, minWidth: 220 }}>
          {mode === "menu" && <>
            <button className="row-menu-item" onClick={() => setMode("rename")}>Rename</button>
            <button className="row-menu-item" onClick={() => setMode("ident")}>Change identifier</button>
            <button className="row-menu-item danger" onClick={() => setMode("remove")}>Remove</button>
          </>}
          {mode === "rename" && <div className="row-menu-confirm"><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} /><div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn primary sm" onClick={() => start(async () => { await renameAudienceAction(audienceId, name); setOpen(false); onDone(); })}>Save</button><button className="btn ghost sm" onClick={() => setMode("menu")}>Cancel</button></div></div>}
          {mode === "ident" && <div className="row-menu-confirm"><span className="cell-sub" style={{ color: "var(--yellow-700, #b45309)" }}>Your applications must send the new identifier. Until they do, grants on this role don&rsquo;t match and people see what everyone sees.</span><input className="input sm mono" style={{ marginTop: 6 }} placeholder="new identifier" value={ident} onChange={(e) => setIdent(e.target.value)} /><div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn primary sm" disabled={!ident.trim()} onClick={() => start(async () => { await changeAudienceIdentifierAction(audienceId, ident); setOpen(false); onDone(); })}>Save</button><button className="btn ghost sm" onClick={() => setMode("menu")}>Cancel</button></div></div>}
          {mode === "remove" && <div className="row-menu-confirm">Remove {label} and its grants? {label} will see what everyone sees.<div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn danger sm" onClick={() => start(async () => { await removeAudienceAction(audienceId); setOpen(false); router.push("/data-flow/masking-policy?view=workspace&focus=everyone"); })}>Remove</button><button className="btn ghost sm" onClick={() => setMode("menu")}>Cancel</button></div></div>}
        </div>
      )}
    </div>
  );
}
