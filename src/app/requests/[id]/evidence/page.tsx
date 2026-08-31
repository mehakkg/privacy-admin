import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  Citation,
  CompletionPill,
  ExecutionPill,
  FieldChips,
  KeyValue,
  Notice,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { computeCompletion } from "@/lib/engines/completion";
import { getRetentionPosture } from "@/lib/guards/retentionGate";
import { searchAuditLog, verifyChain } from "@/lib/engines/audit";
import { evaluateSla } from "@/lib/engines/sla";
import { DPRR_FULFILMENT_PERIOD } from "@/lib/dpdp/statute";
import { REQUEST_TYPE_LABEL, type RequestType } from "@/lib/domain";
import { PrintButton } from "@/components/print";

export const dynamic = "force-dynamic";

/**
 * SCREEN 10 — Evidence Compiler
 *
 * Aggregated automatically from the audit chain, the execution records and the
 * retention decisions. Nothing here is typed in by hand: an evidence pack a
 * human assembles is an account of what happened, and what is wanted is the
 * record of what happened.
 *
 * The pack states the completion position honestly, including partial states and
 * failures, and carries the chain-verification result so a reader can tell
 * whether the trail has been tampered with.
 *
 * EXPORT: CSV is a real download. PDF is produced through the browser's print
 * dialogue against a print stylesheet rather than a PDF library — noted in the
 * README as a deliberate deviation.
 */
export default async function EvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    include: { principal: { include: { identifiers: true } } },
  });
  if (!request) notFound();

  const [completion, posture, entries, chain] = await Promise.all([
    computeCompletion(id),
    getRetentionPosture(request.principalId, id),
    searchAuditLog({ requestId: id, take: 500 }),
    verifyChain(),
  ]);

  const sla = evaluateSla(request.receivedAt, request.slaDeadline);

  return (
    <div className="stack">
      <div className="row no-print">
        <PrintButton />
        <a className="btn" href={`/api/evidence/${id}/csv`} download>
          Export CSV
        </a>
        <span className="cell-sub">
          The pack below is the export. It is generated from the record, not
          composed by hand.
        </span>
      </div>

      <Notice
        tone={chain.ok ? "ok" : "danger"}
        title={
          chain.ok
            ? `Audit chain verified — ${chain.entriesChecked} entries intact`
            : "Audit chain verification FAILED"
        }
      >
        {chain.ok
          ? "Every entry hashes to its recorded value and links to its predecessor. Nothing in this trail has been altered or removed since it was written."
          : chain.reason}
      </Notice>

      <Card title="1. Request">
        <KeyValue
          rows={[
            ["Reference", <span key="a" className="mono">{request.referenceCode}</span>],
            ["Type", REQUEST_TYPE_LABEL[request.type as RequestType]],
            ["Data Principal", request.principal?.displayName ?? "Unresolved"],
            [
              "Identifiers",
              <span key="b" className="mono">
                {request.principal?.identifiers.map((i) => i.value).join(", ") ??
                  request.rawIdentifier}
              </span>,
            ],
            ["Received", formatDateTime(request.receivedAt)],
            [
              "Fulfilment deadline",
              <span key="c">
                {formatDate(sla.deadline)} — {sla.label}
                <div>
                  <Citation
                    citation={DPRR_FULFILMENT_PERIOD.citation}
                    source={DPRR_FULFILMENT_PERIOD.source}
                  />
                </div>
              </span>,
            ],
            [
              "Pre-erasure notice",
              request.preNoticeSentAt
                ? `Sent ${formatDateTime(request.preNoticeSentAt)}; cleared ${formatDateTime(request.preNoticeDueAt)}`
                : "Not sent",
            ],
          ]}
        />
      </Card>

      <Card
        title={
          <span className="row">
            2. Completion position
            <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
          </span>
        }
      >
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Confirmed</th>
                <th>Method</th>
                <th>Withheld fields</th>
              </tr>
            </thead>
            <tbody>
              {completion.targets.map((t) => (
                <tr key={t.targetId}>
                  <td className="cell-primary">{t.name}</td>
                  <td>
                    <ExecutionPill status={t.status} />
                  </td>
                  <td>{formatDateTime(t.confirmedAt)}</td>
                  <td className="cell-sub">{t.verificationMethod ?? "—"}</td>
                  <td>
                    {t.excludedFields.length ? (
                      <FieldChips fields={t.excludedFields} />
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {completion.state !== "verified" && (
          <div style={{ marginTop: 12 }}>
            <Notice tone="warn" title="This request is not fully verified">
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {completion.blockedBy.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Notice>
          </div>
        )}
      </Card>

      <Card title="3. Legal-retention decisions">
        {posture.exceptions.length === 0 ? (
          <div className="empty">No statutory retention obligation applied.</div>
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Citation</th>
                  <th>Fields</th>
                  <th>Decision</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {posture.exceptions.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-primary">{e.dataCategory}</td>
                    <td className="mono cell-sub">{e.statuteRef}</td>
                    <td>
                      <FieldChips fields={e.fieldPaths} />
                    </td>
                    <td>
                      <Pill tone={e.withholds ? "green" : "red"}>
                        {e.withholds ? "Withheld" : "Released by DPO ruling"}
                      </Pill>
                    </td>
                    <td>{e.expiresAt ? formatDate(e.expiresAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`4. Audit trail (${entries.length} entries)`}>
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.seq}</td>
                    <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{entry.actorLabel}</span>
                        <span className="cell-sub">{entry.actorRole}</span>
                      </div>
                    </td>
                    <td className="mono">{entry.action}</td>
                    <td className="cell-sub">
                      {entry.targetType} {entry.targetId.slice(0, 10)}…
                    </td>
                    <td className="mono cell-sub">{entry.payloadHash.slice(0, 12)}…</td>
                  </tr>
                ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">Nothing has been done on this request yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
