import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, ExecutionPill, Notice, Pill, Stat, formatDate } from "@/components/ui";
import { computeCompletion } from "@/lib/engines/completion";
import { decodeList } from "@/lib/codec/json";
import { CONNECTION_STATUS_LABEL, type ConnectionStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 4 — Data Location Map
 *
 * Every system and processor known to hold this Data Principal's data, with a
 * coverage completeness indicator.
 *
 * Coverage is the honest half of "complete". Confirming every location we know
 * about only equals confirming every location if the map itself is trustworthy,
 * so a stale scan or an unreachable system is stated plainly here and withholds
 * `verified` at the request level rather than being quietly ignored.
 */
export default async function LocationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({ where: { id } });
  if (!request) notFound();

  const [completion, locations, allSystems] = await Promise.all([
    computeCompletion(id),
    request.principalId
      ? db.dataLocation.findMany({
          where: { principalId: request.principalId },
          include: { system: true, processor: true },
          orderBy: { recordCount: "desc" },
        })
      : Promise.resolve([]),
    db.connectedSystem.findMany(),
  ]);

  const coveredSystemIds = new Set(locations.map((l) => l.systemId).filter(Boolean));
  const notCovered = allSystems.filter((s) => !coveredSystemIds.has(s.id));

  const totalRecords = locations.reduce((sum, l) => sum + l.recordCount, 0);

  return (
    <div className="stack">
      <Notice
        tone={completion.coverage.complete ? "ok" : "warn"}
        title={
          completion.coverage.complete
            ? "Coverage complete — every known location is accounted for"
            : "Coverage incomplete"
        }
      >
        {completion.coverage.complete ? (
          <>
            The location map is current and no system is unreachable, so
            confirming every target below genuinely means confirming everywhere.
          </>
        ) : (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {completion.coverage.reasons.map((reason) => (
              <li key={reason} style={{ marginBottom: 3 }}>
                {reason}
              </li>
            ))}
          </ul>
        )}
      </Notice>

      <div className="stat-row">
        <Stat label="Locations" value={locations.length} />
        <Stat label="Records" value={totalRecords.toLocaleString("en-IN")} />
        <Stat
          label="Stale inventories"
          value={completion.coverage.staleTargets}
          tone={completion.coverage.staleTargets ? "yellow" : undefined}
        />
        <Stat
          label="Unscannable systems"
          value={completion.coverage.unreachableSystems.length}
          tone={completion.coverage.unreachableSystems.length ? "red" : undefined}
        />
      </div>

      <Card title="Where this Data Principal's data lives">
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Target</th>
                <th>Kind</th>
                <th>Data categories</th>
                <th>Records</th>
                <th>Discovered</th>
                <th>Execution status</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const targetId = location.systemId ?? location.processorId!;
                const target = completion.targets.find((t) => t.targetId === targetId);
                return (
                  <tr key={location.id}>
                    <td>
                      <div className="cell-stack">
                        <span className="cell-primary">
                          {location.system?.name ?? location.processor?.name}
                        </span>
                        <span className="cell-sub">
                          {location.system
                            ? `Owned by ${location.system.ownerTeam}`
                            : `DPA ${location.processor?.dpaId}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      {location.system ? (
                        <Pill
                          tone={
                            location.system.connectionStatus === "healthy"
                              ? "green"
                              : location.system.connectionStatus === "down"
                                ? "red"
                                : "yellow"
                          }
                        >
                          {
                            CONNECTION_STATUS_LABEL[
                              location.system.connectionStatus as ConnectionStatus
                            ]
                          }
                        </Pill>
                      ) : (
                        <Pill tone="purple" dot={false}>
                          Processor
                        </Pill>
                      )}
                    </td>
                    <td>
                      {decodeList(location.dataCategoriesJson).map((c) => (
                        <code key={c} className="field-chip">
                          {c}
                        </code>
                      ))}
                    </td>
                    <td className="mono">{location.recordCount.toLocaleString("en-IN")}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{formatDate(location.discoveredAt)}</span>
                        <span className="cell-sub">via {location.discoverySource}</span>
                        {target?.stale && <Pill tone="yellow">Stale</Pill>}
                      </div>
                    </td>
                    <td>
                      <ExecutionPill status={target?.status ?? "pending"} />
                    </td>
                  </tr>
                );
              })}
              {locations.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      No locations discovered. Coverage cannot be called complete,
                      so this request cannot reach a verified state.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {notCovered.length > 0 && (
        <Card title="Systems with no record for this Data Principal">
          <p className="cell-sub" style={{ marginTop: 0 }}>
            Listed so that &ldquo;not found&rdquo; is a visible result rather than a
            silent absence. A healthy system that was scanned and returned nothing
            is fine; an unreachable one is a hole in the map.
          </p>
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>System</th>
                  <th>Connection</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {notCovered.map((system) => {
                  const unreachable =
                    system.connectionStatus === "down" ||
                    system.connectionStatus === "degraded";
                  return (
                    <tr key={system.id}>
                      <td className="cell-primary">{system.name}</td>
                      <td>
                        <Pill tone={unreachable ? "red" : "green"}>
                          {CONNECTION_STATUS_LABEL[system.connectionStatus as ConnectionStatus]}
                        </Pill>
                      </td>
                      <td className={unreachable ? "" : "muted"}>
                        {unreachable
                          ? "Could not be scanned — we cannot say whether it holds this person's data."
                          : "Scanned, no matching records."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
