"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Lock, Check } from "lucide-react";
import { CustomTemplateCreator } from "@/components/masking/CustomTemplateCreator";
import { setTemplateAssociationAction, type MaskingActionResult } from "@/app/actions/masking";
import type { TemplateView } from "@/lib/masking";
import type { CustomTemplateView } from "@/lib/engines/masking";

const BASE = "/data-flow/protection-rules";

/**
 * "Rule templates" card: a trusted baseline plus the regional/custom templates a
 * tenant tailors to its teams. BASELINE is always on; regional templates toggle
 * on/off (changing which rules apply, live); custom templates filter the list.
 * Each chip links to filter the Rules table by that template.
 */
export function RuleTemplates({ templates, customTemplates }: { templates: TemplateView[]; customTemplates: CustomTemplateView[] }) {
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
    <section className="rtpl-card">
      <div className="tpl-card-icon"><Layers size={18} /></div>
      <div className="tpl-card-main">
        <div className="tpl-card-title">Rule templates</div>
        <div className="cell-sub">Apply a trusted baseline, then tailor it to your teams.</div>
      </div>
      <div className="tpl-chips">
        {templates.map((t) => {
          const href = `${BASE}?governedBy=${t.kind === "baseline" ? "baseline" : t.key}&status=all`;
          return (
            <span key={t.key} className="tpl-chip2">
              <a href={href} className="tpl-chip2-label">
                {t.kind === "baseline" && <Lock size={11} />}
                {t.name}
                {t.kind === "baseline"
                  ? <span className="cell-sub"> · {t.fields} field{t.fields === 1 ? "" : "s"}</span>
                  : <button className={`tpl-state${t.associated ? " on" : ""}`} disabled={pending && busyKey === t.key} onClick={(e) => { e.preventDefault(); toggle(t.key, !t.associated); }} aria-pressed={t.associated} title={t.associated ? "Active — switch off" : "Off — switch on"}>
                      <span className="tpl-dot" /> {t.associated ? <><Check size={10} /> Active</> : "Off"}
                    </button>}
              </a>
            </span>
          );
        })}
        {customTemplates.map((t) => (
          <a key={t.key} href={`${BASE}?governedBy=custom:${t.key}&status=all`} className="tpl-chip2">
            <span className="tpl-chip2-label">{t.name}<span className={`tpl-state ${t.fields > 0 ? "on" : "draft"}`}><span className="tpl-dot" /> {t.fields > 0 ? "Active" : "Draft"}</span></span>
          </a>
        ))}
      </div>
      <CustomTemplateCreator />
      {result && !result.ok && <span className="cell-sub" style={{ color: "var(--red)", flexBasis: "100%" }}>{result.error}</span>}
    </section>
  );
}
