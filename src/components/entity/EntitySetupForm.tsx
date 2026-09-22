"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, AlertTriangle } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { createAcquiredEntityAction } from "@/app/actions/scenario7";
import { ENTITY_SOURCE_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_TONE } from "@/lib/scenario7";
import type { ActionResult } from "@/app/actions/requests";

export interface EntityRow { id: string; name: string; source: string; importStatus: string; mappingCount: number }

export function EntitySetupForm({ entities }: { entities: EntityRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { failed?: string[]; imported?: number }) | null>(null);
  const [name, setName] = useState("");
  const [rawUsers, setRawUsers] = useState("");

  const submit = () => start(async () => {
    const r = await createAcquiredEntityAction(name, rawUsers);
    setResult(r);
    if (r.ok) { setName(""); setRawUsers(""); router.refresh(); }
  });

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head">New acquired entity</div>
        <div className="card-body">
          <ActionError result={result} />
          {result?.ok && (
            <Notice tone={result.failed && result.failed.length ? "warn" : "ok"} title={result.failed && result.failed.length ? `Partial import — ${result.imported} imported, ${result.failed.length} need manual entry` : `Imported ${result.imported} users`}>
              {result.failed && result.failed.length > 0 && <>These rows couldn&apos;t be parsed and fall back to manual entry: {result.failed.join(", ")}</>}
            </Notice>
          )}
          <label className="fld"><span>Entity name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northgate Lending (acquired)" /></label>
          <label className="fld">
            <span>Bulk-import users <span className="cell-sub">paste or CSV — one name per line/comma (reuses the Onboarding Structured-path importer)</span></span>
            <textarea className="input" rows={5} value={rawUsers} onChange={(e) => setRawUsers(e.target.value)} placeholder={"Aarti Nair\nRohan Mehta\nsvc-billing (invalid → falls back to manual)"} />
          </label>
          <button className="btn primary" disabled={pending || !name.trim()} onClick={submit}><Upload size={14} /> Create entity &amp; import structure</button>
          <p className="cell-sub" style={{ marginTop: 8 }}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> Rows that don&apos;t parse as a person name fall back to manual entry for that portion only — the rest still import.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Entities</div>
        <div className="card-body">
          {entities.map((e) => (
            <div key={e.id} className="pick-row">
              <span className="cell-primary" style={{ flex: 1 }}>{e.name}</span>
              <Pill tone={e.source === "acquired" ? "purple" : "gray"} dot={false}>{ENTITY_SOURCE_LABEL[e.source] ?? e.source}</Pill>
              <Pill tone={IMPORT_STATUS_TONE[e.importStatus] ?? "gray"} dot={false}>{IMPORT_STATUS_LABEL[e.importStatus] ?? e.importStatus}</Pill>
              <span className="cell-sub">{e.mappingCount} users</span>
            </div>
          ))}
          {entities.length === 0 && <div className="cell-sub">No entities yet.</div>}
          <p className="cell-sub" style={{ marginTop: 10 }}>Map imported users to their entity in <Link href="/access/entity-mapping">User-to-entity mapping</Link>.</p>
        </div>
      </div>
    </div>
  );
}
