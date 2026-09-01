"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { addDpaReferenceAction, requestDpaUpdateAction } from "@/app/actions/integrations";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface InstructionEntry {
  ref: string;
  status: "pending" | "partial" | "verified" | "failed";
  at: Date | null;
  detail: string | null;
}
export interface SubProcessor {
  name: string;
  status: string;
}
export interface ProcessorRow {
  id: string;
  name: string;
  dpaId: string;
  dpaStatus: "active" | "draft";
  contactChannel: string;
  riskClassification: string | null;
  contractDate: Date | null;
  dpaScope: string[];
  lastInstructionAt: Date | null;
  instructions: InstructionEntry[];
  subProcessors: SubProcessor[];
}

const CHANNEL_LABEL: Record<string, string> = { email: "Email", portal: "Portal", sftp: "SFTP" };
const RISK: Record<string, { label: string; tone: PillTone }> = {
  low: { label: "Low", tone: "green" },
  medium: { label: "Medium", tone: "yellow" },
  high: { label: "High", tone: "red" },
};
const INSTR: Record<InstructionEntry["status"], { label: string; tone: PillTone }> = {
  pending: { label: "Pending", tone: "gray" },
  partial: { label: "Partially complete", tone: "yellow" },
  verified: { label: "Fully verified", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

export function DataProcessorsTable({ rows }: { rows: ProcessorRow[] }) {
  const columns: Column<ProcessorRow>[] = [
    { key: "name", header: "Name", render: (r) => <span className="cell-primary">{r.name}</span> },
    {
      key: "dpa",
      header: "DPA reference",
      width: 150,
      render: (r) =>
        r.dpaStatus === "draft" ? (
          <span className="cell-sub">Pending</span>
        ) : (
          <span className="mono cell-sub">{r.dpaId}</span>
        ),
    },
    { key: "channel", header: "Contact", width: 90, render: (r) => <span className="cell-sub">{CHANNEL_LABEL[r.contactChannel] ?? r.contactChannel}</span> },
    {
      key: "status",
      header: "Status",
      width: 150,
      render: (r) =>
        r.dpaStatus === "draft" ? (
          <Pill tone="red">Draft — DPA pending</Pill>
        ) : (
          <Pill tone="green">Active</Pill>
        ),
    },
    {
      key: "risk",
      header: "Risk",
      width: 90,
      render: (r) =>
        r.riskClassification ? (
          <Pill tone={RISK[r.riskClassification]?.tone ?? "gray"} dot={false}>
            {RISK[r.riskClassification]?.label ?? r.riskClassification}
          </Pill>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: "last",
      header: "Last instruction",
      width: 120,
      render: (r) => <span className="cell-sub">{r.lastInstructionAt ? formatDate(r.lastInstructionAt) : "—"}</span>,
    },
  ];

  return (
    <ListDetail<ProcessorRow>
      items={rows}
      columns={columns}
      emptyLabel="No processors in this view."
      detailEmptyLabel="Select a processor."
      renderDetail={(r) => <ProcessorDrawer key={r.id} processor={r} />}
    />
  );
}

function ProcessorDrawer({ processor }: { processor: ProcessorRow }) {
  const { pending, result, run } = useAction();
  const [dpaRef, setDpaRef] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>{processor.name}</h3>
        <div className="cell-sub">Contact via {CHANNEL_LABEL[processor.contactChannel] ?? processor.contactChannel}</div>
      </div>

      {/* DPA status block. */}
      {processor.dpaStatus === "draft" ? (
        <Notice tone="danger" title="DPA pending">
          <p style={{ margin: "0 0 10px" }}>
            This processor cannot receive a live deletion or access instruction until
            a DPA reference is added. DPDP s.8(2) requires the contract before
            processing begins — this is a hard block enforced at the point of dispatch,
            not a warning.
          </p>
          <div className="section-label">DPA reference</div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input sm"
              style={{ minWidth: 220 }}
              placeholder="e.g. DPA-2026-0207"
              value={dpaRef}
              onChange={(e) => setDpaRef(e.target.value)}
            />
            <button
              className="btn primary sm"
              disabled={pending || !dpaRef.trim()}
              onClick={() => run(() => addDpaReferenceAction(processor.id, dpaRef), () => setDpaRef(""))}
            >
              {pending ? "Saving…" : "Add reference & activate"}
            </button>
          </div>
        </Notice>
      ) : (
        <div className="notice ok">
          <div className="notice-title">DPA active</div>
          <div className="stack" style={{ gap: 2 }}>
            <span className="mono">{processor.dpaId}</span>
            {processor.contractDate && (
              <span className="cell-sub">Executed {formatDate(processor.contractDate)}</span>
            )}
            {processor.dpaScope.length > 0 && (
              <span className="cell-sub">Scope: {processor.dpaScope.join(", ")}</span>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            {!requesting ? (
              <button className="btn sm" onClick={() => setRequesting(true)}>
                Request DPA update
              </button>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <p className="cell-sub" style={{ margin: 0 }}>
                  A live DPA reference is a contractual fact. Changing it goes to Legal
                  as an escalation, rather than being overwritten here.
                </p>
                <input
                  className="input sm"
                  placeholder="What needs updating, and why?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn primary sm"
                    disabled={pending || !reason.trim()}
                    onClick={() => run(() => requestDpaUpdateAction(processor.id, reason), () => { setRequesting(false); setReason(""); })}
                  >
                    Raise with Legal
                  </button>
                  <button className="btn ghost sm" onClick={() => setRequesting(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk classification — Legal-owned, read-only. */}
      <div>
        <div className="section-label">Risk classification</div>
        <div className="row" style={{ gap: 8 }}>
          {processor.riskClassification ? (
            <Pill tone={RISK[processor.riskClassification]?.tone ?? "gray"} dot={false}>
              {RISK[processor.riskClassification]?.label ?? processor.riskClassification}
            </Pill>
          ) : (
            <span className="muted">Not assessed</span>
          )}
        </div>
        <p className="cell-sub" style={{ margin: "4px 0 0" }}>
          Set by Legal/Procurement&apos;s vendor risk assessment. Managed in the
          Governance Portal — visible here, not editable here.
        </p>
      </div>

      {/* Instruction history — three-state per entry. */}
      <div>
        <div className="section-label">Instruction history</div>
        {processor.instructions.length === 0 ? (
          <p className="cell-sub" style={{ margin: 0 }}>No instructions sent yet.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {processor.instructions.map((i) => (
              <div key={i.ref + (i.at?.toISOString() ?? "")} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="mono">{i.ref}</span>
                  {i.at && <span className="cell-sub">{formatDate(i.at)}</span>}
                </span>
                <Pill tone={INSTR[i.status].tone}>{INSTR[i.status].label}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-processors. */}
      {processor.subProcessors.length > 0 && (
        <div>
          <div className="section-label">Disclosed sub-processors</div>
          <div className="stack" style={{ gap: 4 }}>
            {processor.subProcessors.map((sp) => (
              <div key={sp.name} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                <span>{sp.name}</span>
                <Pill tone={sp.status === "approved" ? "green" : "yellow"}>
                  {sp.status === "approved" ? "Approved" : "Disclosed — unreviewed"}
                </Pill>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow map cross-reference. */}
      <div>
        <Link href={`/data-flow/map?q=${encodeURIComponent(processor.name)}`} className="btn sm ghost">
          View in flow map →
        </Link>
        <p className="cell-sub" style={{ margin: "4px 0 0" }}>
          See exactly what data flows to this processor, without leaving the context
          of looking at it.
        </p>
      </div>

      <ActionError result={result} />
    </div>
  );
}
