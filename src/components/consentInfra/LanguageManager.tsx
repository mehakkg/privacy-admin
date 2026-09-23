"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Languages, Plus, Check } from "lucide-react";
import { Notice, Pill, Stat } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { generateLanguageVariantAction } from "@/app/actions/consentInfra";
import type { ActionResult } from "@/app/actions/requests";

export interface NoticeOpt { id: string; name: string }
export interface VariantInfo { language: string; publishStatus: string }

export function LanguageManager({ notices, noticeId, noticeName, languages, variants }: { notices: NoticeOpt[]; noticeId: string; noticeName: string; languages: string[]; variants: VariantInfo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [showAll, setShowAll] = useState(false);

  const byLang = new Map(variants.map((v) => [v.language, v]));
  const missing = languages.filter((l) => !byLang.has(l));
  const rows = showAll ? languages : missing;

  const generate = (language: string) => start(async () => { const r = await generateLanguageVariantAction(noticeId, language); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      {result?.ok && <Notice tone="ok" title="Language variant generated">It now appears as available and can be QA-checked and published.</Notice>}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fld" style={{ margin: 0 }}><span>Notice</span>
          <select className="input" value={noticeId} onChange={(e) => router.push(`/consent/languages?notice=${e.target.value}`)}>
            {notices.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
      </div>

      <div className="stat-row">
        <Stat label="Required (Eighth Schedule)" value={languages.length} />
        <Stat label="Available" value={languages.length - missing.length} tone="green" />
        <Stat label="Missing" value={missing.length} tone={missing.length ? "yellow" : "green"} />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="row" style={{ gap: 6 }}><Languages size={14} /> {noticeName} — language variants</span>
          <span style={{ marginLeft: "auto" }}>
            <button className={`btn xs ${showAll ? "ghost" : ""}`} onClick={() => setShowAll(false)}>Missing only</button>
            <button className={`btn xs ${showAll ? "" : "ghost"}`} onClick={() => setShowAll(true)} style={{ marginLeft: 4 }}>All {languages.length}</button>
          </span>
        </div>
        <div className="card-body">
          {rows.length === 0 && <Notice tone="ok" title="All required languages present">Every Eighth Schedule language has a variant.</Notice>}
          {rows.map((lang) => {
            const v = byLang.get(lang);
            return (
              <div key={lang} className="pick-row">
                <span className="cell-primary" style={{ flex: 1 }}>{lang}</span>
                {v ? (
                  <>
                    <Pill tone="green" dot={false}><Check size={11} style={{ verticalAlign: "-1px" }} /> Available</Pill>
                    <span className="cell-sub">{v.publishStatus}</span>
                  </>
                ) : (
                  <>
                    <Pill tone="yellow" dot={false}>Missing</Pill>
                    <button className="btn xs primary" disabled={pending} onClick={() => generate(lang)}><Plus size={11} /> Generate</button>
                  </>
                )}
              </div>
            );
          })}
          <p className="cell-sub" style={{ marginTop: 10 }}>Base language is English (§5(3)). QA each variant in <Link href="/consent/language-qa" className="row-link">Language rendering QA</Link>.</p>
        </div>
      </div>
    </div>
  );
}
