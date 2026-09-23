"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2, RefreshCw, Database, Cloud, AppWindow, FolderOpen, Plus, PlugZap } from "lucide-react";
import { InfoTip, Pill, Notice, formatDate } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { syncSourceAction, createManualSourceAction } from "@/app/actions/sourceSync";
import { SOURCE_HEALTH_LABEL, SOURCE_HEALTH_TONE, SOURCE_HEALTH_TIP, SOURCE_KIND_LABEL, type SourceHealth } from "@/lib/sources";
import type { ActionResult } from "@/app/actions/requests";

export interface SourceRow {
  id: string; name: string; kind: string; health: SourceHealth;
  lastSync: string | null; fields: number; origin: "native" | "acquired"; entityName: string | null; approved: boolean;
  provenance: "dlp_synced" | "manually_added"; noConnection: boolean;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  database: <Database size={15} />, cloud_storage: <Cloud size={15} />, saas: <AppWindow size={15} />, file_share: <FolderOpen size={15} />,
};

function OriginBadge({ origin, entityName }: { origin: string; entityName: string | null }) {
  if (origin !== "acquired") return <span className="cell-sub">Native</span>;
  return <span title={entityName ? `Acquired entity: ${entityName}` : undefined}><Pill tone="purple" dot={false}>Acquired{entityName ? ` · ${entityName}` : ""}</Pill></span>;
}

function StatusChip({ s }: { s: SourceRow }) {
  if (s.noConnection) {
    return (
      <span className="row" style={{ gap: 5 }}>
        <Pill tone="orange" dot={false}>No automated scan</Pill>
        <InfoTip align="left" text="Manually added with no live connection yet — configure a connection or run manual review. It does not behave like a fully-synced source." />
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 5 }}>
      <Pill tone={SOURCE_HEALTH_TONE[s.health]} dot={false}>{SOURCE_HEALTH_LABEL[s.health]}</Pill>
      <InfoTip align="left" text={SOURCE_HEALTH_TIP[s.health]} />
    </span>
  );
}

function ProvenanceBadge({ provenance }: { provenance: string }) {
  return provenance === "manually_added"
    ? <Pill tone="blue" dot={false}>Manually added</Pill>
    : <Pill tone="gray" dot={false}>DLP-synced</Pill>;
}

function AddSourceModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("database");
  const [method, setMethod] = useState<"live" | "manual_none">("manual_none");

  const submit = () => start(async () => {
    const r = await createManualSourceAction({ name, kind, connectionMethod: method });
    setResult(r);
    if (r.ok) { onClose(); router.refresh(); }
  });

  return (
    <Modal
      title="Add a source"
      subtitle="Register a source manually, alongside the DLP-synced pass-through. It is tagged Manually added and gets in-product scan configuration."
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending || !name.trim()} onClick={submit}>{pending ? "Adding…" : "Add source"}</button></>}
    >
      <ActionError result={result} />
      <label className="fld"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Legacy Loan Mainframe" /></label>
      <label className="fld"><span>Type</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {["database", "cloud_storage", "saas", "file_share", "other"].map((k) => <option key={k} value={k}>{SOURCE_KIND_LABEL[k] ?? k}</option>)}
        </select>
      </label>
      <label className="fld"><span>Connection method</span>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as "live" | "manual_none")}>
          <option value="live">Live integration (connected)</option>
          <option value="manual_none">Manual — no live connection yet</option>
        </select>
      </label>
      {method === "manual_none" && (
        <Notice tone="warn" title="No automated scan">
          Without a live connection this source can&rsquo;t be scanned automatically — it will show a &ldquo;configure a connection or run manual review&rdquo; state. Add a connection later to enable scanning.
        </Notice>
      )}
    </Modal>
  );
}

export function SourcesView({ rows }: { rows: SourceRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<"table" | "cards">("table");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sync = (id: string) => { setBusyId(id); start(async () => { const r = await syncSourceAction(id); setResult(r); setBusyId(null); if (r.ok) router.refresh(); }); };

  return (
    <div>
      <ActionError result={result} />
      <div className="row" style={{ justifyContent: "space-between", gap: 4, marginBottom: 10 }}>
        <button className="btn primary sm" onClick={() => setAdding(true)}><Plus size={13} /> Add source</button>
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn xs ${view === "table" ? "" : "ghost"}`} onClick={() => setView("table")}><Table2 size={12} /> Table</button>
          <button className={`btn xs ${view === "cards" ? "" : "ghost"}`} onClick={() => setView("cards")}><LayoutGrid size={12} /> Cards</button>
        </div>
      </div>
      {adding && <AddSourceModal onClose={() => setAdding(false)} />}

      {rows.length === 0 ? (
        <div className="empty">No source matches this view.</div>
      ) : view === "table" ? (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Name</th><th>Provenance</th><th>Type</th><th>Connection</th><th>Origin</th><th>Last sync</th><th>Records</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/data-map/sources/${s.id}`} className="row-link">{s.name}</Link></td>
                  <td><ProvenanceBadge provenance={s.provenance} /></td>
                  <td className="cell-sub"><span className="row" style={{ gap: 6 }}>{KIND_ICON[s.kind]}{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</span></td>
                  <td><StatusChip s={s} /></td>
                  <td><OriginBadge origin={s.origin} entityName={s.entityName} /></td>
                  <td className="cell-sub">{s.lastSync ? formatDate(new Date(s.lastSync)) : "—"}</td>
                  <td className="mono cell-sub">{s.fields}</td>
                  <td>
                    {s.noConnection
                      ? <Link href={`/data-map/sources/${s.id}?tab=scan`} className="btn xs"><PlugZap size={11} /> Configure</Link>
                      : s.approved && <button className="btn xs" disabled={pending && busyId === s.id} onClick={() => sync(s.id)}><RefreshCw size={11} /> {pending && busyId === s.id ? "Syncing…" : "Sync"}</button>}
                  </td>
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
                  <StatusChip s={s} />
                </div>
                <div className="row" style={{ gap: 6, margin: "4px 0 10px" }}>
                  <ProvenanceBadge provenance={s.provenance} />
                  <span className="cell-sub"><span className="row" style={{ gap: 6 }}>{KIND_ICON[s.kind]}{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</span></span>
                </div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <OriginBadge origin={s.origin} entityName={s.entityName} />
                  <span className="cell-sub mono">{s.fields} fields</span>
                </div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span className="cell-sub">{s.lastSync ? `Synced ${formatDate(new Date(s.lastSync))}` : "Never synced"}</span>
                  {s.noConnection
                    ? <Link href={`/data-map/sources/${s.id}?tab=scan`} className="btn xs"><PlugZap size={11} /> Configure</Link>
                    : s.approved && <button className="btn xs" disabled={pending && busyId === s.id} onClick={() => sync(s.id)}><RefreshCw size={11} /> Sync</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
