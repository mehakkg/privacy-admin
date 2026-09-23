"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2, RefreshCw, Database, Cloud, AppWindow, FolderOpen } from "lucide-react";
import { InfoTip, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { syncSourceAction } from "@/app/actions/sourceSync";
import { SOURCE_HEALTH_LABEL, SOURCE_HEALTH_TONE, SOURCE_HEALTH_TIP, SOURCE_KIND_LABEL, type SourceHealth } from "@/lib/sources";
import type { ActionResult } from "@/app/actions/requests";

export interface SourceRow {
  id: string; name: string; kind: string; health: SourceHealth;
  lastSync: string | null; fields: number; origin: "native" | "acquired"; entityName: string | null; approved: boolean;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  database: <Database size={15} />, cloud_storage: <Cloud size={15} />, saas: <AppWindow size={15} />, file_share: <FolderOpen size={15} />,
};

function OriginBadge({ origin, entityName }: { origin: string; entityName: string | null }) {
  if (origin !== "acquired") return <span className="cell-sub">Native</span>;
  return <span title={entityName ? `Acquired entity: ${entityName}` : undefined}><Pill tone="purple" dot={false}>Acquired{entityName ? ` · ${entityName}` : ""}</Pill></span>;
}

function StatusChip({ health }: { health: SourceHealth }) {
  return (
    <span className="row" style={{ gap: 5 }}>
      <Pill tone={SOURCE_HEALTH_TONE[health]} dot={false}>{SOURCE_HEALTH_LABEL[health]}</Pill>
      <InfoTip align="left" text={SOURCE_HEALTH_TIP[health]} />
    </span>
  );
}

export function SourcesView({ rows }: { rows: SourceRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<"table" | "cards">("table");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sync = (id: string) => { setBusyId(id); start(async () => { const r = await syncSourceAction(id); setResult(r); setBusyId(null); if (r.ok) router.refresh(); }); };

  return (
    <div>
      <ActionError result={result} />
      <div className="row" style={{ justifyContent: "flex-end", gap: 4, marginBottom: 10 }}>
        <button className={`btn xs ${view === "table" ? "" : "ghost"}`} onClick={() => setView("table")}><Table2 size={12} /> Table</button>
        <button className={`btn xs ${view === "cards" ? "" : "ghost"}`} onClick={() => setView("cards")}><LayoutGrid size={12} /> Cards</button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No source matches this view.</div>
      ) : view === "table" ? (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Name</th><th>Type</th><th>Connection</th><th>Origin</th><th>Last sync</th><th>Records</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/data-map/sources/${s.id}`} className="row-link">{s.name}</Link></td>
                  <td className="cell-sub"><span className="row" style={{ gap: 6 }}>{KIND_ICON[s.kind]}{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</span></td>
                  <td><StatusChip health={s.health} /></td>
                  <td><OriginBadge origin={s.origin} entityName={s.entityName} /></td>
                  <td className="cell-sub">{s.lastSync ? formatDate(new Date(s.lastSync)) : "—"}</td>
                  <td className="mono cell-sub">{s.fields}</td>
                  <td>{s.approved && <button className="btn xs" disabled={pending && busyId === s.id} onClick={() => sync(s.id)}><RefreshCw size={11} /> {pending && busyId === s.id ? "Syncing…" : "Sync"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-grid">
          {rows.map((s) => (
            <div key={s.id} className="card">
              <div className="card-body">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <Link href={`/data-map/sources/${s.id}`} className="row-link cell-primary">{s.name}</Link>
                  <StatusChip health={s.health} />
                </div>
                <div className="cell-sub" style={{ margin: "4px 0 10px" }}><span className="row" style={{ gap: 6 }}>{KIND_ICON[s.kind]}{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</span></div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <OriginBadge origin={s.origin} entityName={s.entityName} />
                  <span className="cell-sub mono">{s.fields} fields</span>
                </div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span className="cell-sub">{s.lastSync ? `Synced ${formatDate(new Date(s.lastSync))}` : "Never synced"}</span>
                  {s.approved && <button className="btn xs" disabled={pending && busyId === s.id} onClick={() => sync(s.id)}><RefreshCw size={11} /> Sync</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
