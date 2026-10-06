"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eye } from "lucide-react";
import { PreviewPanel } from "@/components/maskingpolicy/PreviewPanel";
import type { GridView } from "@/lib/engines/maskingpolicy";

/** On-demand preview. A right-hand drawer; the trigger is a quiet link. */
export function PreviewDrawer({ draft, live, label, startVersion, startAudience }: { draft: GridView | null; live: GridView | null; label: string; startVersion?: "draft" | "live"; startAudience?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <button className="row-link" onClick={() => setOpen(true)}><Eye size={14} /> {label}</button>
      {open && mounted && createPortal(
        <div className="mp-drawer-scrim" onClick={() => setOpen(false)}>
          <aside className="mp-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Preview">
            <div className="mp-drawer-head"><strong>Preview</strong><button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button></div>
            <div className="mp-drawer-body"><PreviewPanel draft={draft} live={live} startVersion={startVersion} startAudience={startAudience} /></div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
