"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

/**
 * The one-line note shown on a destination page when a user arrives through a
 * redirect from a retired page (Sources, Review queue). It is not a banner and
 * never blocks content. Shown once per user per old page (localStorage), with a
 * "Where did things go?" disclosure listing where each old job now lives.
 */

const RELOCATIONS: { from: string; to: string; href: string }[] = [
  { from: "Sources and scan configuration", to: "Settings › Integrations › DLP", href: "/integrations/dlp" },
  { from: "Unclassified fields", to: "Data inventory, filter “Not classified”", href: "/discovery/inventory?filter=not-classified" },
  { from: "Quarantine candidates", to: "Managed in DLP", href: "/integrations/dlp" },
  { from: "Near-duplicates", to: "Rights requests › Identity matching", href: "/requests/identity-matching" },
  { from: "Undisclosed scripts", to: "Consent & notices › Cookie & website scan", href: "/consent/cookies?tab=monitoring" },
];

export function MovedNote({ moved }: { moved?: string }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const key = moved ? `privacy-admin.moved.${moved}` : "";

  useEffect(() => {
    if (!moved) return;
    try { if (!window.localStorage.getItem(key)) setShow(true); } catch { setShow(true); }
  }, [moved, key]);

  if (!moved || !show) return null;
  const dismiss = () => { try { window.localStorage.setItem(key, "1"); } catch { /* fine */ } setShow(false); };

  return (
    <div className="moved-note" role="note">
      <div className="moved-note-line">
        <span>Sources and Review queue have moved. Discovery now comes from DLP.</span>
        <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Where did things go?</button>
        <button className="icon-btn moved-note-x" onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
      </div>
      {open && (
        <ul className="moved-note-list">
          {RELOCATIONS.map((r) => (
            <li key={r.from}>
              <span className="cell-sub">{r.from}</span>
              <ArrowRight size={12} aria-hidden />
              <Link href={r.href} className="row-link">{r.to}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
