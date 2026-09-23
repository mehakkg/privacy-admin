"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { Pill } from "@/components/ui";

export interface EntityNode {
  id: string; name: string; kind: string; parentId: string | null;
  source: "native" | "acquired"; complete: boolean; missing: string[]; usersMapped: number;
}

function CompletenessChip({ n }: { n: EntityNode }) {
  if (n.complete) return <Pill tone="green" dot={false}><CheckCircle2 size={11} style={{ verticalAlign: "-1px" }} /> Fully configured</Pill>;
  return <Pill tone="red" dot={false}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> Incomplete — needs {n.missing.join(" + ")}</Pill>;
}

function EntityRowLine({ n, indent }: { n: EntityNode; indent?: boolean }) {
  return (
    <div className="pick-row" style={indent ? { paddingLeft: 34 } : undefined}>
      <span className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <Building2 size={14} className="cell-sub" />
        <Link href="/settings/entity-setup" className="row-link cell-primary">{n.name}</Link>
        {n.source === "acquired" && <Pill tone="purple" dot={false}>Acquired</Pill>}
        <span className="cell-sub">{n.kind === "legal_entity" ? "Legal entity" : "Business unit"} · {n.usersMapped} users</span>
      </span>
      <CompletenessChip n={n} />
    </div>
  );
}

export function EntityHierarchy({ entities }: { entities: EntityNode[] }) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const childrenOf = new Map<string, EntityNode[]>();
  const roots: EntityNode[] = [];
  for (const e of entities) {
    const parent = e.parentId && byId.has(e.parentId) ? e.parentId : null;
    if (parent) { const arr = childrenOf.get(parent) ?? []; arr.push(e); childrenOf.set(parent, arr); }
    else roots.push(e);
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="cell-sub">{entities.length} entities · governance-completeness computed the same way Onboarding checks a fully-configured entity.</span>
        <Link href="/settings/entity-setup" className="btn primary sm">Set up a new entity</Link>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {roots.map((p) => {
            const kids = childrenOf.get(p.id) ?? [];
            const isCollapsed = collapsed[p.id] ?? false;
            return (
              <div key={p.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                <div className="row" style={{ alignItems: "center" }}>
                  {kids.length > 0 ? (
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setCollapsed((c) => ({ ...c, [p.id]: !isCollapsed }))} aria-label="Toggle subsidiaries">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : <span style={{ width: 28 }} />}
                  <div style={{ flex: 1 }}><EntityRowLine n={p} /></div>
                  {kids.length > 0 && <span className="cell-sub" style={{ paddingRight: 14 }}>{kids.length} subsidiar{kids.length === 1 ? "y" : "ies"}</span>}
                </div>
                {!isCollapsed && kids.map((k) => <EntityRowLine key={k.id} n={k} indent />)}
              </div>
            );
          })}
          {roots.length === 0 && <div className="empty">No entities yet.</div>}
        </div>
      </div>
    </div>
  );
}
