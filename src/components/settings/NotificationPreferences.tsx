"use client";

import { useState, useTransition } from "react";
import { Lock, Check } from "lucide-react";
import { ActionError } from "@/components/actions";
import { savePreferenceAction } from "@/app/actions/notifications";
import { CATEGORY_ORDER, CATEGORY_LABEL, CATEGORY_DESC, isMutable, type NotificationCategory } from "@/lib/notifications";
import type { ActionResult } from "@/app/actions/requests";

export interface PrefValue { channels: string[]; muted: boolean }

/**
 * SETTINGS → NOTIFICATIONS — per-person (per acting role) configuration. One row
 * per category: channel checkboxes + a mute toggle. Saves immediately per row
 * (matches the product's other toggle-style settings). Required categories can't
 * be muted — the toggle is locked with inline copy, and the server refuses it too.
 */
export function NotificationPreferences({ initial }: { initial: Record<string, PrefValue> }) {
  const [prefs, setPrefs] = useState<Record<string, PrefValue>>(() =>
    Object.fromEntries(CATEGORY_ORDER.map((c) => [c, initial[c] ?? { channels: ["in_app"], muted: false }])),
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const persist = (category: string, next: PrefValue) => {
    setPrefs((p) => ({ ...p, [category]: next }));
    start(async () => {
      const r = await savePreferenceAction(category, next.channels, next.muted);
      setResult(r.ok ? null : r);
      if (r.ok) setSavedAt(category);
    });
  };

  const toggleChannel = (c: string, ch: string) => {
    const cur = prefs[c];
    const channels = cur.channels.includes(ch) ? cur.channels.filter((x) => x !== ch) : [...cur.channels, ch];
    persist(c, { ...cur, channels });
  };
  const toggleMute = (c: string) => { const cur = prefs[c]; persist(c, { ...cur, muted: !cur.muted }); };

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable notif-prefs">
          <thead>
            <tr><th>Category</th><th style={{ width: 90 }}>In-app</th><th style={{ width: 90 }}>Email</th><th style={{ width: 220 }}>Mute</th></tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((c) => {
              const p = prefs[c];
              const mutable = isMutable(c);
              return (
                <tr key={c}>
                  <td>
                    <div className="cell-stack">
                      <span className="row" style={{ gap: 6 }}><span className="cell-primary">{CATEGORY_LABEL[c as NotificationCategory]}</span>{savedAt === c && !pending && <span className="cell-sub" style={{ color: "var(--green)" }}><Check size={11} style={{ verticalAlign: "-1px" }} /> saved</span>}</span>
                      <span className="cell-sub">{CATEGORY_DESC[c as NotificationCategory]}</span>
                    </div>
                  </td>
                  <td><input type="checkbox" checked={p.channels.includes("in_app")} disabled={pending} onChange={() => toggleChannel(c, "in_app")} /></td>
                  <td><input type="checkbox" checked={p.channels.includes("email")} disabled={pending} onChange={() => toggleChannel(c, "email")} /></td>
                  <td>
                    {mutable ? (
                      <label className="row" style={{ gap: 6 }}>
                        <span className={`switch${p.muted ? " on" : ""}`}><input type="checkbox" checked={p.muted} disabled={pending} onChange={() => toggleMute(c)} /><span className="switch-knob" /></span>
                        <span className="cell-sub">{p.muted ? "Muted" : "On"}</span>
                      </label>
                    ) : (
                      <span className="locked-mute" title="Required notification">
                        <Lock size={12} /> Can&rsquo;t be muted
                        <span className="cell-sub" style={{ display: "block", fontWeight: 400 }}>Tied to a statutory or governance deadline — channels can still be adjusted.</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cell-sub" style={{ marginTop: 10 }}>Changes save automatically. These preferences are yours — they never change what anyone else sees, and they never silence a role-targeted required alert.</p>
      {result && <ActionError result={result} />}
    </div>
  );
}
