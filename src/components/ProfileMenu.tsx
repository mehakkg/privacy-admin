"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, LogOut, Settings, User } from "lucide-react";
import { switchRole } from "@/app/actions/session";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

const ROLES: ActorRole[] = ["admin", "dpo", "grievance_officer", "ciso", "legal"];

/**
 * Profile dropdown (app-shell-ui-spec §3.1). The header carries only the avatar;
 * everything else lives here: identity (name + email), Switch role (the demo
 * role switcher, folded in from the old header control), notification access
 * (kept as a menu entry rather than a header bell), Profile / Settings, Logout.
 */
export function ProfileMenu({
  initials,
  name,
  email,
  currentRole,
  unread,
}: {
  initials: string;
  name: string;
  email: string;
  currentRole: ActorRole;
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);

  const pick = (role: ActorRole) => {
    if (role === currentRole) { setOpen(false); return; }
    start(async () => { await switchRole(role); setOpen(false); router.refresh(); });
  };

  return (
    <div className="profile-wrap" ref={ref}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>

      {open && (
        <div className="popover" role="menu">
          <div className="popover-identity">
            <span className="pi-avatar" aria-hidden>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="pi-name">{name}</div>
              <div className="pi-email">{email}</div>
            </div>
          </div>

          <div className="popover-divider" />
          <div className="popover-label">Switch role</div>
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={`popover-row role-row${role === currentRole ? " selected" : ""}`}
              role="menuitemradio"
              aria-checked={role === currentRole}
              disabled={pending}
              onClick={() => pick(role)}
            >
              <span className="pr-label">{ROLE_LABEL[role]}</span>
              {role === currentRole && <span className="check"><Check size={15} /></span>}
            </button>
          ))}

          <div className="popover-divider" />
          <Link href="/notifications" className="popover-row" role="menuitem" onClick={() => setOpen(false)}>
            <Bell size={16} />
            <span className="pr-label">Notifications</span>
            {unread > 0 && <span className="pr-badge">{unread}</span>}
          </Link>
          <Link href="/onboarding/escalation" className="popover-row" role="menuitem" onClick={() => setOpen(false)}>
            <User size={16} />
            <span className="pr-label">Profile</span>
          </Link>
          <Link href="/settings/organization" className="popover-row" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={16} />
            <span className="pr-label">Settings</span>
          </Link>

          <div className="popover-divider" />
          <button type="button" className="popover-row logout" role="menuitem">
            <LogOut size={16} />
            <span className="pr-label">Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
