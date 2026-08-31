import { db } from "@/lib/db";
import {
  Card,
  ExecutionPill,
  Notice,
  Pill,
  formatDateTime,
} from "@/components/ui";
import { ChecklistToggle, ConfirmManualButton } from "@/components/actions";
import type { ExecutionStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 8 — Manual Verification Panel
 *
 * For systems with no API, where "the deletion happened" is a claim made by a
 * person rather than an acknowledgement returned by a machine.
 *
 * The checklist exists so that claim is specific. Attestation is refused while
 * any step is unchecked — enforced on the server, not by disabling the button —
 * and the attesting actor and timestamp are recorded, because an unattributed
 * "yes, done" is not evidence of anything.
 */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const records = await db.executionRecord.findMany({
    where: { requestId: id, mode: "manual" },
    include: {
      system: true,
      confirmedBy: true,
      checklist: { orderBy: { ordinal: "asc" }, include: { checkedBy: true } },
    },
  });

  // Manual systems that hold this person's data but have no record yet.
  const request = await db.dataPrincipalRequest.findUnique({ where: { id } });
  const pendingManualSystems = request?.principalId
    ? await db.dataLocation.findMany({
        where: {
          principalId: request.principalId,
          system: { hasApi: false },
          systemId: { notIn: records.map((r) => r.systemId!).filter(Boolean) },
        },
        include: { system: true },
      })
    : [];

  return (
    <div className="stack">
      <Notice tone="info" title="Systems that cannot confirm for themselves">
        These systems expose no API, so nothing can acknowledge the deletion
        automatically. Their owning team performs the work and an Admin attests to
        it here. The attestation is recorded with who made it and when — it is
        evidence, and it is treated as such.
      </Notice>

      {records.map((record) => {
        const remaining = record.checklist.filter((i) => !i.checked).length;
        return (
          <Card
            key={record.id}
            title={
              <span className="row">
                {record.system?.name}
                <ExecutionPill status={record.status as ExecutionStatus} />
                <Pill tone="gray" dot={false}>
                  Owned by {record.system?.ownerTeam}
                </Pill>
              </span>
            }
          >
            {record.status === "verified" ? (
              <Notice tone="ok" title="Attested">
                Confirmed {formatDateTime(record.confirmedAt)} by{" "}
                {record.confirmedBy?.name ?? "an Admin"} via manual attestation.
              </Notice>
            ) : (
              <p className="cell-sub" style={{ marginTop: 0 }}>
                {remaining} of {record.checklist.length} steps outstanding.
              </p>
            )}

            <div style={{ marginTop: 10 }}>
              {record.checklist.map((item) => (
                <div key={item.id}>
                  <ChecklistToggle
                    requestId={id}
                    itemId={item.id}
                    checked={item.checked}
                    label={item.label}
                  />
                  {item.checked && item.checkedAt && (
                    <div
                      className="cell-sub"
                      style={{ marginLeft: 26, marginTop: -4, marginBottom: 4 }}
                    >
                      {formatDateTime(item.checkedAt)}
                      {item.checkedBy ? ` · ${item.checkedBy.name}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {record.status !== "verified" && (
              <div style={{ marginTop: 14 }}>
                <ConfirmManualButton
                  requestId={id}
                  executionRecordId={record.id}
                  remaining={remaining}
                />
              </div>
            )}
          </Card>
        );
      })}

      {pendingManualSystems.map((location) => (
        <Card key={location.id} title={location.system?.name}>
          <Notice tone="warn" title="No verification checklist yet">
            {location.system?.name} holds{" "}
            {location.recordCount.toLocaleString("en-IN")} records for this Data
            Principal and has no API. A checklist has not been raised for this
            request, so this target cannot yet be confirmed and the request cannot
            reach a verified state.
          </Notice>
        </Card>
      ))}

      {records.length === 0 && pendingManualSystems.length === 0 && (
        <Card>
          <div className="empty">
            No system on this request requires manual verification.
          </div>
        </Card>
      )}
    </div>
  );
}
