"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ShieldCheck, Clock, AlarmClock, PlugZap, AlertTriangle, GitCompareArrows, Check } from "lucide-react";
import { markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { SEVERITY_RANK, type NotificationCategory } from "@/lib/notifications";

export interface BellItem {
  id: string;
  category: string;
  severity: string; // critical | warning | info
  title: string;
  body: string;
  createdAt: string; // ISO
  read: boolean;
  href: string | null;
}

const ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  dpo_approval_needed: ShieldCheck,
  drift_detected: GitCompareArrows,
  dsr_sla_deadline: Clock,
  breach_clock: AlarmClock,
  integration_sync_failure: PlugZap,
  policy_violation: AlertTriangle,
  general_activity: Bell,
};

function rel(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Badge color reflects the highest-severity UNREAD item.
  const highestUnread = items.filter((i) => !i.read).reduce((acc, i) => Math.min(acc, SEVERITY_RANK[i.severity] ?? 2), 3);
  const badgeTone = highestUnread === 0 ? "crit" : highestUnread === 1 ? "warn" : "neutral";

  // Severity-first, then recency (recompute client-side to be safe).
  const sorted = [...items].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2) || b.createdAt.localeCompare(a.createdAt));

  const go = (it: BellItem) => {
    setOpen(false);
    if (!it.read) start(async () => { await markReadAction(it.id); router.refresh(); });
    if (it.href) router.push(it.href);
  };
  const markAll = () => start(async () => { await markAllReadAction(); router.refresh(); });

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => setOpen((o) => !o)}>
        <Bell size={16} strokeWidth={1.9} />
        {unread > 0 && <span className={`icon-badge tone-${badgeTone}`}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="linklike" style={{ fontSize: 12 }} onClick={markAll}>Mark all as read</button>}
          </div>
          <div className="bell-list">
            {sorted.length === 0 ? (
              <div className="bell-empty"><Check size={22} color="var(--green)" /><p style={{ margin: "8px 0 0", fontWeight: 500 }}>You&rsquo;re all caught up</p><p className="cell-sub" style={{ margin: 0 }}>No notifications right now.</p></div>
            ) : sorted.map((it) => {
              const Icon = ICON[it.category as NotificationCategory] ?? Bell;
              const tone = it.severity === "critical" ? "crit" : it.severity === "warning" ? "warn" : "neutral";
              return (
                <button key={it.id} className={`bell-row${it.read ? "" : " unread"}`} onClick={() => go(it)}>
                  <span className={`bell-icon tone-${tone}`}><Icon size={15} /></span>
                  <span className="bell-row-body">
                    <span className="bell-row-title">{!it.read && <span className="bell-dot" />}{it.title}</span>
                    <span className="bell-row-sub">{it.body}</span>
                    <span className="bell-row-time">{rel(it.createdAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Link href="/notifications" className="bell-viewall" onClick={() => setOpen(false)}>View all →</Link>
        </div>
      )}
    </div>
  );
}
