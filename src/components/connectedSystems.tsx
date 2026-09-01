"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { SourceForm } from "@/components/onboardingForms";
import { setSystemRolesAction } from "@/app/actions/integrations";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface ReferencingRequest {
  ref: string;
  typeLabel: string;
  statusLabel: string;
}

export interface SystemRow {
  id: string; // DiscoverySource id — the registry record
  name: string;
  kindLabel: string;
  scanTarget: boolean;
  execTarget: boolean;
  statusLabel: string;
  statusTone: PillTone;
  lastVerifiedAt: Date | null;
  usedByCount: number;
  sourceHref: string;
  referencedBy: ReferencingRequest[];
}

function roleOf(r: SystemRow): { label: string; tone: PillTone } {
  if (r.scanTarget && r.execTarget) return { label: "Both", tone: "purple" };
  if (r.execTarget) return { label: "Execution target", tone: "blue" };
  return { label: "Scan target", tone: "gray" };
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) router.refresh();
    });
  return { pending, result, run };
}

export function ConnectedSystemsTable({ rows }: { rows: SystemRow[] }) {
  const [adding, setAdding] = useState(false);

  const columns: Column<SystemRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => <span className="cell-primary">{r.name}</span>,
    },
    { key: "type", header: "Type", width: 120, render: (r) => <span className="cell-sub">{r.kindLabel}</span> },
    {
      key: "role",
      header: "Role",
      width: 140,
      render: (r) => {
        const role = roleOf(r);
        return <Pill tone={role.tone}>{role.label}</Pill>;
      },
    },
    { key: "status", header: "Status", width: 120, render: (r) => <Pill tone={r.statusTone}>{r.statusLabel}</Pill> },
    {
      key: "verified",
      header: "Last verified",
      width: 120,
      render: (r) => <span className="cell-sub">{r.lastVerifiedAt ? formatDate(r.lastVerifiedAt) : "—"}</span>,
    },
    {
      key: "used",
      header: "Used by",
      width: 90,
      render: (r) => (
        <span className="mono cell-sub" title="Open requests targeting this system for execution">
          {r.usedByCount || "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <ListDetail<SystemRow>
        items={rows}
        columns={columns}
        emptyLabel="No systems in this view."
        detailEmptyLabel="Select a system."
        renderDetail={(r) => <SystemDrawer key={r.id} system={r} />}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary sm" onClick={() => setAdding((v) => !v)}>
          + Add system
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h2 className="card-title">Add a system</h2>
          </div>
          <div className="card-body">
            <Notice tone="info" title="This is the same registry as Data Discovery's Sources">
              A system added here is one record, not a second copy — it appears in
              Data Discovery&apos;s Sources too. Flag it as an execution target in its
              drawer once connected.
            </Notice>
            <div style={{ marginTop: 12 }}>
              <SourceForm />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemDrawer({ system }: { system: SystemRow }) {
  const { pending, result, run } = useAction();
  const [scan, setScan] = useState(system.scanTarget);
  const [exec, setExec] = useState(system.execTarget);
  const dirty = scan !== system.scanTarget || exec !== system.execTarget;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>{system.name}</h3>
        <div className="cell-sub">
          {system.kindLabel} · <Pill tone={system.statusTone}>{system.statusLabel}</Pill>
        </div>
      </div>

      <div>
        <div className="section-label">Purpose roles</div>
        <div className="stack" style={{ gap: 6 }}>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={scan} onChange={() => setScan((v) => !v)} />
            <span>Available as scan target</span>
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={exec} onChange={() => setExec((v) => !v)} />
            <span>Available as execution target</span>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button
            className="btn primary sm"
            disabled={pending || !dirty}
            onClick={() => run(() => setSystemRolesAction(system.id, scan, exec))}
          >
            {pending ? "Saving…" : "Save roles"}
          </button>
          <Link href={system.sourceHref} className="btn sm ghost">
            Open full source detail →
          </Link>
        </div>
        <p className="cell-sub" style={{ margin: "8px 0 0" }}>
          Scan configuration and scan history live on the source detail page — not
          duplicated here. This is one record serving two purposes.
        </p>
      </div>

      <div>
        <div className="section-label">Currently referenced by</div>
        {system.referencedBy.length === 0 ? (
          <p className="cell-sub" style={{ margin: 0 }}>
            No open request has an execution step targeting this system. It can be
            reconfigured without affecting anything in flight.
          </p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {system.referencedBy.map((rq) => (
              <Link
                key={rq.ref}
                href={`/requests`}
                className="row"
                style={{ gap: 8, justifyContent: "space-between" }}
              >
                <span className="mono">{rq.ref}</span>
                <span className="cell-sub">
                  {rq.typeLabel} · {rq.statusLabel}
                </span>
              </Link>
            ))}
            <p className="cell-sub" style={{ margin: "2px 0 0" }}>
              Disconnecting or reconfiguring this system would affect these open
              requests — shown so it is not done blind.
            </p>
          </div>
        )}
      </div>

      <ActionError result={result} />
    </div>
  );
}
