"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { deriveMasking, renderValue, strengthLabel, inferDataType, TIERS, TIER_TONE, TIER_DEFAULT_RANK, type Tier } from "@/lib/maskingpolicy";
import { setBaselineAction, setFieldCategoryAction, classifyFieldAction } from "@/app/actions/maskingpolicy";

export interface DecisionItem { code: string; displayName: string; sampleValue: string; categoryId: string }
interface Cat { id: string; name: string; definition: string }

/**
 * Decisions inbox (above the grid). One card at a time with "N of M". Resolving a
 * card collapses it to a one-line summary with Undo and opens the next. When all
 * are done it collapses to "All decisions made". Undecided fields stay hidden.
 */
export function DecisionsInbox({ vid, items, categories }: { vid: string; items: DecisionItem[]; categories: Cat[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const remaining = items.filter((i) => !done[i.code]);

  if (items.length === 0) return null;
  if (remaining.length === 0) {
    return <div className="mp-decisions done"><Check size={14} /> All decisions made. <button className="link-btn" onClick={() => { setDone({}); setIdx(0); }}>Review again</button></div>;
  }
  const current = remaining[Math.min(idx, remaining.length - 1)];

  const resolve = (label: string) => { setDone((d) => ({ ...d, [current.code]: label })); setIdx(0); router.refresh(); };
  const undo = (code: string) => setDone((d) => { const n = { ...d }; delete n[code]; return n; });

  return (
    <div className="mp-decisions">
      <div className="mp-decisions-head"><strong>Decisions</strong><span className="cell-sub">{items.length - remaining.length + 1} of {items.length}</span></div>
      {Object.entries(done).map(([code, label]) => {
        const it = items.find((i) => i.code === code); if (!it) return null;
        return <div key={code} className="mp-decision-done"><Check size={13} /> {it.displayName}: {label} <button className="link-btn" onClick={() => undo(code)}><RotateCcw size={11} /> Undo</button></div>;
      })}
      <DecisionCard key={current.code} item={current} categories={categories} vid={vid} onResolve={resolve} />
    </div>
  );
}

function DecisionCard({ item, categories, vid, onResolve }: { item: DecisionItem; categories: Cat[]; vid: string; onResolve: (label: string) => void }) {
  const [catId, setCatId] = useState(item.categoryId);
  const [, start] = useTransition();
  const cat = categories.find((c) => c.id === catId);
  const dataType = inferDataType(item.code);

  const classify = (tier: Tier) => start(async () => {
    if (catId !== item.categoryId) await setFieldCategoryAction(item.code, catId);
    await classifyFieldAction(item.code, tier);
    onResolve(`${tier}`);
  });
  const markNotUsed = () => start(async () => { await setBaselineAction(vid, item.code, null, "not_used"); onResolve("not used"); });

  return (
    <div className="mp-decision-card">
      <div className="mp-decision-title"><strong>New field from your apps:</strong> <span className="cell-primary">{item.displayName}</span> <span className="cell-sub mono">{item.code}</span></div>
      <label className="fld"><span>What kind of data is this?</span>
        <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      {cat && <p className="cell-sub" style={{ margin: "-2px 0 0" }}>{cat.definition}</p>}
      <div className="fld"><span>How sensitive is it? Its masking follows the sensitivity you pick.</span>
        <div className="mp-strengthgrid">
          {TIERS.map((t) => {
            const rank = TIER_DEFAULT_RANK[t];
            const example = renderValue(deriveMasking(dataType, rank, false).masking, item.sampleValue);
            return (
              <button key={t} className="mp-tiercard" onClick={() => classify(t)}>
                <span className="mp-tier"><span className="mp-tier-dot" style={{ background: (TIER_TONE[t] ?? TIER_TONE["Not classified"]).dot }} />{t}</span>
                <span className="mono cell-sub">{example} · {strengthLabel(rank)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="cell-sub" style={{ margin: 0 }}>Sample value is made up — never real customer data.</p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <button className="btn ghost sm" onClick={markNotUsed}>My applications don&rsquo;t use this</button>
      </div>
    </div>
  );
}
