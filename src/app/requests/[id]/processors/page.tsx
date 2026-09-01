import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  Citation,
  ExecutionPill,
  FieldChips,
  KeyValue,
  Notice,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { ConfirmProcessorButton, InstructProcessorButton } from "@/components/actions";
import { computeCompletion } from "@/lib/engines/completion";
import { getRetentionPosture, excludedFieldsFor } from "@/lib/guards/retentionGate";
import { decodeList } from "@/lib/codec/json";
import { PROCESSOR_RESPONSIBILITY } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6 — Processor Instruction Panel
 *
 * DPA-scope validation, dispatch, delivery confirmation.
 *
 * The scope check is not a warning. If the data categories held by a processor
 * fall outside what its DPA covers, dispatch is refused: the Data Fiduciary
 * remains responsible for processing carried out on its behalf (s.8(2)), so an
 * instruction beyond the contract is not something Admin can paper over. The
 * DPA has to be extended first, and that is the DPO's to do.
 *
 * A processor's confirmation counts toward completion. Handing an instruction
 * to a vendor is not the same as the data being gone, so dispatch leaves the
 * target pending until the vendor confirms it acted.
 */
export default async function ProcessorsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({ where: { id } });
  if (!request) notFound();

  const [completion, posture, locations] = await Promise.all([
    computeCompletion(id),
    getRetentionPosture(request.principalId, id),
    request.principalId
      ? db.dataLocation.findMany({
          where: { principalId: request.principalId, processorId: { not: null } },
          include: { processor: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="stack">
      <Notice tone="info" title="Processors are the Fiduciary's responsibility">
        Engaging a Data Processor does not transfer accountability. Each
        instruction below is validated against the scope of its Data Processing
        Agreement before it can be dispatched, and the processor&apos;s
        confirmation is required before this request can be reported complete.
        <div style={{ marginTop: 6 }}>
          <Citation citation={PROCESSOR_RESPONSIBILITY.citation} source="statute" />
        </div>
      </Notice>

      {locations.map((location) => {
        const processor = location.processor!;
        const categories = decodeList(location.dataCategoriesJson);
        const dpaScope = decodeList(processor.dpaScopeJson);
        const outOfScope = categories.filter((c) => !dpaScope.includes(c));
        const inScope = categories.filter((c) => dpaScope.includes(c));
        const excluded = excludedFieldsFor(posture, categories);

        const target = completion.targets.find((t) => t.targetId === processor.id);
        const dispatched = Boolean(target?.executionRecordId);
        const dpaExpired =
          processor.dpaExpiresAt && processor.dpaExpiresAt.getTime() < Date.now();

        return (
          <Card
            key={location.id}
            title={
              <span className="row">
                {processor.name}
                <ExecutionPill status={target?.status ?? "pending"} />
              </span>
            }
          >
            <KeyValue
              rows={[
                [
                  "DPA",
                  <span key="d" className="row">
                    <span className="mono">{processor.dpaId}</span>
                    {dpaExpired ? (
                      <Pill tone="red">Expired</Pill>
                    ) : (
                      <Pill tone="green">
                        Valid to {formatDate(processor.dpaExpiresAt)}
                      </Pill>
                    )}
                  </span>,
                ],
                ["Channel", processor.contactChannel],
                [
                  "DPA covers",
                  <div key="s">
                    {dpaScope.map((c) => (
                      <code key={c} className="field-chip">
                        {c}
                      </code>
                    ))}
                  </div>,
                ],
                [
                  "Data held here",
                  <div key="h">
                    {inScope.map((c) => (
                      <code key={c} className="field-chip">
                        {c}
                      </code>
                    ))}
                    {outOfScope.map((c) => (
                      <code
                        key={c}
                        className="field-chip"
                        style={{
                          background: "var(--red-bg)",
                          borderColor: "var(--red-border)",
                          color: "var(--red)",
                        }}
                      >
                        {c}
                      </code>
                    ))}
                  </div>,
                ],
                ["Records", location.recordCount.toLocaleString("en-IN")],
                ...(excluded.length > 0
                  ? ([["Withheld by law", <FieldChips key="e" fields={excluded} />]] as [
                      React.ReactNode,
                      React.ReactNode,
                    ][])
                  : []),
              ]}
            />

            {outOfScope.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="danger" title="Outside the scope of the DPA">
                  This processor holds{" "}
                  <strong>{outOfScope.join(", ")}</strong> data, which{" "}
                  {processor.dpaId} does not cover. Dispatch is refused by the
                  server. The DPA must be extended by the DPO before this
                  instruction can be sent.
                </Notice>
              </div>
            )}

            {target?.deliveredAt && (
              <p className="cell-sub" style={{ marginTop: 12, marginBottom: 0 }}>
                Instruction delivered {formatDateTime(target.deliveredAt)} via{" "}
                {processor.contactChannel}.
                {target.confirmedAt
                  ? ` Processor confirmed it acted on ${formatDateTime(target.confirmedAt)}.`
                  : " Awaiting the processor's confirmation that it acted — until then this target stays pending."}
              </p>
            )}

            <div style={{ marginTop: 14 }} className="row">
              {!dispatched && (
                <InstructProcessorButton requestId={id} processorId={processor.id} />
              )}
              {dispatched && target?.status !== "verified" && target?.executionRecordId && (
                <ConfirmProcessorButton
                  requestId={id}
                  executionRecordId={target.executionRecordId}
                />
              )}
            </div>
          </Card>
        );
      })}

      {locations.length === 0 && (
        <Card>
          <div className="empty">
            No Data Processor holds data for this Data Principal.
          </div>
        </Card>
      )}
    </div>
  );
}
