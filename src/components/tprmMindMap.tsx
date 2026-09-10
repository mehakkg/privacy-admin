"use client";

import { useState } from "react";
import Link from "next/link";
import { DATA_CATEGORY_LABEL, type DataCategory } from "@/lib/domain";

export interface MindMapProcessor {
  id: string;
  name: string;
  links: { purpose: string; pii: string[] }[];
}

const piiLabel = (t: string) => DATA_CATEGORY_LABEL[t as DataCategory] ?? t;

/**
 * Processor–Purpose–PII mind-map. Click a processor to highlight every purpose
 * and PII category it touches (the rest dim) — the "which processors touch which
 * data" question answered visually. Built from the same processor records the
 * rest of the dashboard reads, never a separate graph store.
 */
export function TprmMindMap({ processors }: { processors: MindMapProcessor[] }) {
  const [selected, setSelected] = useState<string | null>(processors[0]?.id ?? null);
  const active = processors.find((p) => p.id === selected) ?? null;

  const allPurposes = [...new Set(processors.flatMap((p) => p.links.map((l) => l.purpose)))].sort();
  const allPii = [...new Set(processors.flatMap((p) => p.links.flatMap((l) => l.pii)))].sort();
  const activePurposes = new Set(active?.links.map((l) => l.purpose) ?? []);
  const activePii = new Set(active?.links.flatMap((l) => l.pii) ?? []);

  if (processors.length === 0) return <p className="cell-sub" style={{ margin: 0 }}>No processor-to-purpose mappings yet.</p>;

  return (
    <div className="mindmap">
      <div className="mm-col">
        <div className="mm-head">Processors</div>
        {processors.map((p) => (
          <button key={p.id} className={`mm-node proc${selected === p.id ? " on" : ""}`} onClick={() => setSelected(p.id)}>{p.name}</button>
        ))}
      </div>
      <div className="mm-col">
        <div className="mm-head">Purposes</div>
        {allPurposes.map((pur) => (
          <div key={pur} className={`mm-node${active ? (activePurposes.has(pur) ? " lit" : " dim") : ""}`}>{pur}</div>
        ))}
        {allPurposes.length === 0 && <span className="cell-sub">—</span>}
      </div>
      <div className="mm-col">
        <div className="mm-head">PII categories</div>
        {allPii.map((t) => (
          <div key={t} className={`mm-node${active ? (activePii.has(t) ? " lit" : " dim") : ""}`}>{piiLabel(t)}</div>
        ))}
        {allPii.length === 0 && <span className="cell-sub">—</span>}
      </div>
    </div>
  );
}
