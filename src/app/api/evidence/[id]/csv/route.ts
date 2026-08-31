import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCompletion } from "@/lib/engines/completion";
import { searchAuditLog, verifyChain } from "@/lib/engines/audit";
import { getRetentionPosture } from "@/lib/guards/retentionGate";

/**
 * Evidence pack as CSV.
 *
 * Aggregated from the same engines the screen reads, so the export and the
 * screen cannot disagree. Sections are stacked into one file with a blank line
 * between them: an evidence pack is a document, not a single table, and
 * splitting it across downloads makes it easier to hand over half of it.
 */
function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRows(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    include: { principal: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const [completion, posture, entries, chain] = await Promise.all([
    computeCompletion(id),
    getRetentionPosture(request.principalId, id),
    searchAuditLog({ requestId: id, take: 1000 }),
    verifyChain(),
  ]);

  const sections: string[] = [];

  sections.push(
    toRows([
      ["EVIDENCE PACK"],
      ["Reference", request.referenceCode],
      ["Type", request.type],
      ["Data Principal", request.principal?.displayName ?? "Unresolved"],
      ["Identifier", request.rawIdentifier],
      ["Received", request.receivedAt.toISOString()],
      ["Fulfilment deadline", request.slaDeadline.toISOString()],
      ["Pre-erasure notice sent", request.preNoticeSentAt?.toISOString() ?? "Not sent"],
      ["Generated", new Date().toISOString()],
    ]),
  );

  sections.push(
    toRows([
      ["COMPLETION"],
      ["State", completion.state],
      ["Has failures", completion.hasFailures ? "yes" : "no"],
      ["Coverage complete", completion.coverage.complete ? "yes" : "no"],
      ...completion.coverage.reasons.map((r) => ["Coverage gap", r]),
      ...completion.blockedBy.map((r) => ["Blocked by", r]),
    ]),
  );

  sections.push(
    toRows([
      ["TARGETS"],
      ["Target", "Kind", "Mode", "Status", "Confirmed at", "Confirmed by", "Method", "Withheld fields", "Failure code", "Failure detail"],
      ...completion.targets.map((t) => [
        t.name,
        t.kind,
        t.mode ?? "",
        t.status,
        t.confirmedAt?.toISOString() ?? "",
        t.confirmedBy ?? "",
        t.verificationMethod ?? "",
        t.excludedFields.join("; "),
        t.failureCode ?? "",
        t.failureDetail ?? "",
      ]),
    ]),
  );

  sections.push(
    toRows([
      ["RETENTION DECISIONS"],
      ["Category", "Citation", "Legal basis", "Fields", "Review status", "Withheld", "Expires"],
      ...posture.exceptions.map((e) => [
        e.dataCategory,
        e.statuteRef,
        e.legalBasis,
        e.fieldPaths.join("; "),
        e.reviewStatus,
        e.withholds ? "yes" : "no",
        e.expiresAt?.toISOString() ?? "",
      ]),
    ]),
  );

  sections.push(
    toRows([
      ["AUDIT TRAIL"],
      ["Chain verified", chain.ok ? "yes" : "no"],
      ...(chain.ok ? [] : [["Chain failure", chain.reason ?? ""]]),
      ["Seq", "Timestamp", "Actor", "Role", "Action", "Target type", "Target id", "Payload", "Hash", "Prev hash"],
      ...entries
        .slice()
        .reverse()
        .map((e) => [
          e.seq,
          e.timestamp.toISOString(),
          e.actorLabel,
          e.actorRole,
          e.action,
          e.targetType,
          e.targetId,
          e.payloadJson,
          e.payloadHash,
          e.prevHash,
        ]),
    ]),
  );

  const body = sections.join("\n\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-${request.referenceCode}.csv"`,
    },
  });
}
