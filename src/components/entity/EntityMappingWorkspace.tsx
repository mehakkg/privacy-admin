"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, ArrowRight, AlertTriangle } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { bulkMapUsersToEntityAction } from "@/app/actions/scenario7";
import type { ActionResult } from "@/app/actions/requests";

export interface UserRow { name: string; currentEntity: string | null }
export interface EntityOpt { id: string; name: string }

export function EntityMappingWorkspace({ entities, users }: { entities: EntityOpt[]; users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { mapped?: number; flagged?: { userName: string; conflictEntity: string }[] }) | null>(null);
  const [target, setTarget] = useState(entities[0]?.id ?? "");
  const [sel, setSel] = useState<string[]>([]);

  const targetName = entities.find((e) => e.id === target)?.name ?? "";
  const toggle = (n: string) => setSel((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n]);
  const run = () => start(async () => { const r = await bulkMapUsersToEntityAction(target, sel); setResult(r); if (r.ok) { setSel([]); router.refresh(); } });

  return (
    <div>
      <ActionError result={result} />
      {result?.ok && (
        <Notice tone={result.flagged && result.flagged.length ? "warn" : "ok"} title={`${result.mapped} user(s) mapped${result.flagged && result.flagged.length ? ` · ${result.flagged.length} flagged for individual review` : ""}`}>
          {result.flagged && result.flagged.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {result.flagged.map((f, i) => <li key={i}><strong>{f.userName}</strong> — excluded: active scope under {f.conflictEntity}. Map individually with an explicit dual-scope justification.</li>)}
            </ul>
          )}
        </Notice>
      )}

      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="cell-sub">Map selected users to:</span>
        <select className="input" style={{ width: 260 }} value={target} onChange={(e) => setTarget(e.target.value)}>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button className="btn primary sm" disabled={pending || !target || sel.length === 0} onClick={run}><Users size={13} /> Map {sel.length} user(s) to {targetName}</button>
      </div>
      <p className="cell-sub" style={{ margin: "0 0 10px" }}>A user with active assignments under a different entity is excluded from the bulk action and flagged — never silently reassigned or silently dual-scoped.</p>

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th style={{ width: 32 }}></th><th>User</th><th>Current entity</th><th></th><th>Target</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const conflict = u.currentEntity && u.currentEntity !== targetName;
              return (
                <tr key={u.name}>
                  <td><input type="checkbox" checked={sel.includes(u.name)} onChange={() => toggle(u.name)} /></td>
                  <td className="cell-primary">{u.name}</td>
                  <td>{u.currentEntity ? <Pill tone={conflict ? "yellow" : "gray"} dot={false}>{u.currentEntity}</Pill> : <span className="cell-sub">unmapped</span>}</td>
                  <td><ArrowRight size={13} className="cell-sub" /></td>
                  <td>{conflict ? <span className="cell-sub" style={{ color: "var(--yellow)" }}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> will be flagged</span> : <span>{targetName}</span>}</td>
                </tr>
              );
            })}
            {users.length === 0 && <tr><td colSpan={5}><div className="empty">No users to map. Import users via Entity setup.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
