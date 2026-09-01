"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Profile dropdown.
 *
 * "Resume setup" lives here rather than in the sidebar. Onboarding is a
 * one-time gated flow that already resurfaces on relevant pages through the
 * "Complete your setup" banner; a permanent sidebar entry would duplicate that
 * mechanism and add an item whose only job, once setup is done, is to be
 * ignored. A menu item is the right home for the occasional "take me back in".
 */
export function ProfileMenu({
  initials,
  name,
  role,
}: {
  initials: string;
  name: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="profile-wrap" ref={ref}>
      <button
        type="button"
        className="profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden>
          {initials}
        </span>
        <span className="profile-meta">
          <span className="profile-name">{name}</span>
          <span className="profile-role">{role}</span>
        </span>
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <div className="profile-name">{name}</div>
            <div className="profile-role">{role}</div>
          </div>
          <Link href="/onboarding/escalation" className="profile-menu-item" role="menuitem">
            Resume setup
          </Link>
          <button type="button" className="profile-menu-item" role="menuitem" disabled>
            Change password
          </button>
          <button type="button" className="profile-menu-item" role="menuitem" disabled>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
