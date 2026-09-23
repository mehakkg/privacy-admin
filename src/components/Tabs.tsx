"use client";

/**
 * A small reusable tab bar. Deliberately minimal — the app previously hand-rolled
 * `.stepper` navs everywhere; this gives one canonical control-driven tab UI.
 * Tabs are mutually-exclusive by construction (a single active key), which is the
 * point for e.g. Regular vs Deep scan results (never blended).
 */
export interface TabDef { key: string; label: string; badge?: number }

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (key: string) => void }) {
  return (
    <nav className="stepper" style={{ marginBottom: 14 }} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          className={`step${t.key === active ? " active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          <span className="step-label">{t.label}{typeof t.badge === "number" ? ` (${t.badge})` : ""}</span>
        </button>
      ))}
    </nav>
  );
}
