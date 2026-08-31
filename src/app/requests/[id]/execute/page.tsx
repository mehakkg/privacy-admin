import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  Citation,
  ExecutionPill,
  FieldChips,
  Notice,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { ExecuteButton } from "@/components/actions";
import { computeCompletion } from "@/lib/engines/completion";
import { getRetentionPosture, excludedFieldsFor } from "@/lib/guards/retentionGate";
import { evaluatePreNotice } from "@/lib/engines/sla";
import { decodeList } from "@/lib/codec/json";
import { ERASURE_PRE_NOTICE } from "@/lib/dpdp/statute";
import { CONNECTION_STATUS_LABEL, type ConnectionStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 5 — Execution Control Panel
 *
 * Per-system execution, with the retention exclusions shown inline on the card
 * for the system they apply to — the operator sees which fields are being
 * withheld at the moment they press the button, not on a different screen.
 *
 * Systems with no API get no execute button at all: pressing one would be a lie.
 * They route to manual verification. Backup targets on a rotation window are
 * scheduled rather than executed, and stay pending until the window passes.
 */
export default async function ExecutePage({
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
          where: { principalId: request.principalId, systemId: { not: null } },
          include: { system: true },
        })
      : Promise.resolve([]),
  ]);

  const preNotice = evaluatePreNotice(request.preNoticeSentAt, request.preNoticeDueAt);
  const preNoticeBlocks = request.type === "erasure" && !preNotice.cleared;

  return (
    <div className="stack">
      {!posture.clear && (
        <Notice tone="danger" title="Execution is blocked by the retention gate">
          {posture.unreviewedCount} legal-retention obligation
          {posture.unreviewedCount === 1 ? "" : "s"} for this Data Principal remain
          unreviewed. The server refuses every execution mutation until they are
          reviewed — this is not merely a disabled button.{" "}
          <Link href={`/requests/${id}/retention`}>Review them →</Link>
        </Notice>
      )}

      {preNoticeBlocks && (
        <Notice tone="warn" title="Pre-erasure notice has not cleared">
          {preNotice.sent
            ? `Erasure becomes permitted at ${formatDateTime(preNotice.clearsAt)} — ${Math.ceil(preNotice.hoursRemaining)}h remain.`
            : `The Data Principal must be given ${ERASURE_PRE_NOTICE.hours} hours' notice before erasure. Send it from the request page.`}
          <div style={{ marginTop: 6 }}>
            <Citation citation={ERASURE_PRE_NOTICE.citation} source="statute" />
          </div>
        </Notice>
      )}

      {posture.protectedFields.length > 0 && (
        <Notice tone="policy" title="Partial deletion — fields withheld by law">
          The following fields are excluded from every deletion below. Everything
          else in each record is erased.
          <div style={{ marginTop: 8 }}>
            <FieldChips fields={posture.protectedFields} />
          </div>
        </Notice>
      )}

      <div className="grid-2">
        {locations.map((location) => {
          const system = location.system!;
          const categories = decodeList(location.dataCategoriesJson);
          const excluded = excludedFieldsFor(posture, categories);
          const target = completion.targets.find((t) => t.targetId === system.id);
          const status = target?.status ?? "pending";
          const executed = Boolean(target?.executionRecordId);

          return (
            <Card
              key={location.id}
              title={
                <span className="row">
                  {system.name}
                  <ExecutionPill status={status} />
                </span>
              }
            >
              <div className="row" style={{ marginBottom: 10 }}>
                <Pill
                  tone={
                    system.connectionStatus === "healthy"
                      ? "green"
                      : system.connectionStatus === "down"
                        ? "red"
                        : "yellow"
                  }
                >
                  {CONNECTION_STATUS_LABEL[system.connectionStatus as ConnectionStatus]}
                </Pill>
                <Pill tone="gray" dot={false}>
                  {system.executionMode === "delayed"
                    ? `Delayed — ${system.delayDays}-day rotation`
                    : system.executionMode === "manual"
                      ? "Manual only"
                      : "API"}
                </Pill>
                <span className="cell-sub">
                  {location.recordCount.toLocaleString("en-IN")} records
                </span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="section-label">Categories</div>
                {categories.map((c) => (
                  <code key={c} className="field-chip">
                    {c}
                  </code>
                ))}
              </div>

              {excluded.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="section-label">Withheld from this deletion</div>
                  <FieldChips fields={excluded} />
                  <p className="cell-sub" style={{ margin: "4px 0 0" }}>
                    This will be recorded as a partial, field-level deletion.
                  </p>
                </div>
              )}

              {target?.scheduledFor && (
                <Notice tone="info">
                  Scheduled for {formatDate(target.scheduledFor)}, when the backup
                  set rotates. It stays <strong>pending</strong> until then —
                  reporting it complete now would be inaccurate.
                </Notice>
              )}

              {target?.confirmedAt && (
                <p className="cell-sub" style={{ marginBottom: 8 }}>
                  Confirmed {formatDateTime(target.confirmedAt)}
                  {target.confirmedBy ? ` by ${target.confirmedBy}` : ""} via{" "}
                  {target.verificationMethod}
                </p>
              )}

              <div style={{ marginTop: 12 }}>
                {!system.hasApi ? (
                  <Notice tone="warn" title="No API — cannot be dispatched">
                    {system.name} exposes no API. {system.ownerTeam} carries out
                    the deletion, and it is recorded on the{" "}
                    <Link href={`/requests/${id}/verify`}>
                      manual verification
                    </Link>{" "}
                    panel with an attestation.
                  </Notice>
                ) : (
                  <ExecuteButton
                    requestId={id}
                    systemId={system.id}
                    disabled={!posture.clear || preNoticeBlocks}
                    label={
                      executed
                        ? "Re-run execution"
                        : system.executionMode === "delayed"
                          ? "Schedule for rotation window"
                          : "Execute deletion"
                    }
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {locations.length === 0 && (
        <Card>
          <div className="empty">No systems hold data for this Data Principal.</div>
        </Card>
      )}
    </div>
  );
}
