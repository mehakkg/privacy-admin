import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Small, dependency-free visual primitives for dashboards — a conic-gradient
 * donut with optional click-through segments, and a percentage ring. Pure (no
 * hooks), so server components can render them directly.
 */

export interface Segment { value: number; color: string; label: string; href?: string }

export function Donut({ segments, center }: { segments: Segment[]; center?: ReactNode }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  let acc = 0;
  const stops = segments.map((s) => {
    const from = (acc / total) * 360; acc += s.value; const to = (acc / total) * 360;
    return `${s.color} ${from}deg ${to}deg`;
  }).join(", ");
  return (
    <div className="row" style={{ gap: 16, alignItems: "center" }}>
      <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
        <div style={{ width: 110, height: 110, borderRadius: "50%", background: total === 1 && segments.every((s) => !s.value) ? "var(--bg-muted)" : `conic-gradient(${stops})` }} />
        <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.1 }}>{center}</div>
      </div>
      <div className="stack" style={{ gap: 5 }}>
        {segments.map((s) => {
          const body = (
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: s.color }} />
              <span className="cell-sub">{s.label}</span>
              <span className="cell-primary">{s.value}</span>
            </span>
          );
          return s.href ? <Link key={s.label} href={s.href} className="viz-legend-link">{body}</Link> : <span key={s.label}>{body}</span>;
        })}
      </div>
    </div>
  );
}

export function Ring({ pct, tone = "var(--accent)", label }: { pct: number; tone?: string; label?: string }) {
  return (
    <div className="row" style={{ gap: 14, alignItems: "center" }}>
      <div style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}>
        <div style={{ width: 92, height: 92, borderRadius: "50%", background: `conic-gradient(${tone} ${pct * 3.6}deg, var(--bg-muted) 0deg)` }} />
        <div style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center" }}>
          <span className="stat-value" style={{ fontSize: 18 }}>{pct}%</span>
        </div>
      </div>
      {label && <span className="cell-sub">{label}</span>}
    </div>
  );
}

/** A ranked list of processors (expiry / SLA breach) — not just a count. */
export function RankedList({ items }: { items: { name: string; note: string; tone?: "red" | "yellow"; href: string }[] }) {
  if (items.length === 0) return <p className="cell-sub" style={{ margin: 0 }}>None.</p>;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {items.map((it, i) => (
        <Link key={it.name} href={it.href} className={`ranked-row${i === 0 && it.tone ? " top" : ""}`}>
          <span className="cell-primary">{it.name}</span>
          <span className="cell-sub" style={{ color: it.tone ? `var(--${it.tone})` : undefined }}>{it.note}</span>
        </Link>
      ))}
    </div>
  );
}
