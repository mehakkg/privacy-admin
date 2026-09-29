"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Lock, Check } from "lucide-react";
import { Pill } from "@/components/ui";
import { setTemplateAssociationAction, type MaskingActionResult } from "@/app/actions/masking";
import type { TemplateView } from "@/lib/masking";

/**
 * Template switcher on the By-field tab. BASELINE is always on; regional templates
 * (DPDP, RBI) can be switched on/off — switching one changes which rules are
 * applied to your data, live. Also links to filter the list by that template.
 */
export function TemplateSwitcher({ templates }: { templates: TemplateView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [result, setResult] = useState<MaskingActionResult | null>(null);

  const toggle = (key: string, associated: boolean) => {
    setBusyKey(key);
    start(async () => {
      const r = await setTemplateAssociationAction(key, associated);
      setResult(r); setBusyKey(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="mask-templates">
      <span className="row" style={{ gap: 6, alignItems: "center", marginRight: 4 }}><Layers size={15} className="muted" /> <strong>Templates</strong></span>
      {templates.map((t) => {
        const filterHref = `/data-flow/protection-rules?governedBy=${t.kind === "baseline" ? "baseline" : t.key}`;
        return (
          <div key={t.key} className={`tpl-chip${t.associated ? " on" : ""}`}>
            <a href={filterHref} className="tpl-chip-label">
              {t.kind === "baseline" && <Lock size={11} />}
              {t.name}
              <span className="cell-sub">· {t.fields} field{t.fields === 1 ? "" : "s"}</span>
            </a>
            {t.kind === "baseline" ? (
              <Pill tone="gray" dot={false}>always on</Pill>
            ) : (
              <button
                className={`tpl-toggle${t.associated ? " on" : ""}`}
                disabled={pending && busyKey === t.key}
                onClick={() => toggle(t.key, !t.associated)}
                aria-pressed={t.associated}
                title={t.associated ? "Switch off — its rules stop applying" : "Switch on — apply its rules"}
              >
                {t.associated ? <><Check size={12} /> Active</> : "Off"}
              </button>
            )}
          </div>
        );
      })}
      {result && !result.ok && <span className="cell-sub" style={{ color: "var(--red)" }}>{result.error}</span>}
    </div>
  );
}
