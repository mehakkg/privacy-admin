import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompletionPill, PageHead, Pill } from "@/components/ui";
import { computeCompletion } from "@/lib/engines/completion";
import { evaluateSla } from "@/lib/engines/sla";
import { getRetentionPosture } from "@/lib/guards/retentionGate";
import {
  ESCALATION_SOURCE_LABEL,
  REQUEST_TYPE_LABEL,
  type EscalationSource,
  type RequestType,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Request detail shell with a GATED stepper.
 *
 * The gate that matters is on the server (guards/retentionGate.ts). This is the
 * same rule expressed in navigation: while an unreviewed legal-retention
 * obligation exists, every step from Execute onwards is locked, so retention is
 * surfaced BEFORE any deletion action is reachable rather than discovered
 * afterwards (criterion 4).
 *
 * Locking the links is a courtesy. Typing the URL still fails, because the
 * server action calls `assertRetentionReviewed` before it does anything.
 */
export default async function RequestLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    include: { principal: true },
  });
  if (!request) notFound();

  const [completion, posture] = await Promise.all([
    computeCompletion(id),
    getRetentionPosture(request.principalId, id),
  ]);
  const sla = evaluateSla(request.receivedAt, request.slaDeadline);

  const identityResolved = !request.requiresIdentityReview && Boolean(request.principalId);
  const executionUnlocked = identityResolved && posture.clear;

  /**
   * The six tabs of the request anchor entity. Every one is reachable without
   * leaving the page.
   *
   * Scope & Retention is the blocking gate: while an unreviewed legal-retention
   * obligation exists, Execution and Processor Instructions stay locked, so the
   * obligation is met BEFORE any deletion action is reachable (criterion 4).
   * Evidence and Audit Trail are never locked — they are read surfaces, and
   * hiding the record of what has happened helps nobody.
   */
  const tabs: {
    href: string;
    label: string;
    locked: boolean;
    done: boolean;
    sub?: string;
    lockReason?: string;
  }[] = [
    { href: "", label: "Overview", locked: false, done: identityResolved },
    {
      href: "/scope",
      label: "Scope & Retention",
      locked: !identityResolved,
      done: posture.clear && completion.coverage.complete,
      sub: posture.clear
        ? completion.coverage.complete
          ? undefined
          : "coverage incomplete"
        : `${posture.unreviewedCount} obligation${posture.unreviewedCount === 1 ? "" : "s"} unreviewed`,
      lockReason: "Resolve the Data Principal's identity first.",
    },
    {
      href: "/execution",
      label: "Execution",
      locked: !executionUnlocked,
      done: completion.state === "verified",
      sub: completion.hasFailures
        ? `${completion.totals.failed} failed`
        : completion.totals.verified > 0
          ? `${completion.totals.verified}/${completion.totals.targets} confirmed`
          : undefined,
      lockReason: posture.clear
        ? "Resolve the Data Principal's identity first."
        : `${posture.unreviewedCount} legal-retention obligation${posture.unreviewedCount === 1 ? "" : "s"} must be reviewed first.`,
    },
    {
      href: "/processors",
      label: "Processor Instructions",
      locked: !executionUnlocked,
      done: false,
      lockReason: posture.clear
        ? "Resolve the Data Principal's identity first."
        : "Review the retention obligations first.",
    },
    { href: "/evidence", label: "Evidence", locked: false, done: false },
    { href: "/audit", label: "Audit Trail", locked: false, done: false },
  ];

  return (
    <Shell active="/requests" title={`Requests / ${request.referenceCode}`}>
      <PageHead
        crumbs={[
          { label: "Requests", href: "/requests" },
          { label: request.referenceCode },
        ]}
        title={`${REQUEST_TYPE_LABEL[request.type as RequestType]} — ${request.principal?.displayName ?? request.rawIdentifier}`}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
            <Pill tone="gray" dot={false}>
              {ESCALATION_SOURCE_LABEL[request.escalationSource as EscalationSource]}
            </Pill>
            <span
              style={{
                color:
                  sla.band === "breached"
                    ? "var(--red)"
                    : sla.band === "due_soon"
                      ? "var(--yellow)"
                      : "var(--text-3)",
              }}
            >
              {sla.label}
            </span>
            {request.linkedGrievanceCaseId && (
              <span className="mono cell-sub">
                Grievance case {request.linkedGrievanceCaseId}
              </span>
            )}
          </span>
        }
        actions={
          <Link href={`/audit?requestId=${id}`} className="btn sm">
            Audit trail
          </Link>
        }
      />

      <nav className="stepper">
        {tabs.map((tab) =>
          tab.locked ? (
            <span key={tab.label} className="step locked" title={tab.lockReason}>
              <span className="step-label">
                {tab.label}
                <span aria-hidden>🔒</span>
              </span>
              {tab.lockReason && <span className="step-sub">{tab.lockReason}</span>}
            </span>
          ) : (
            <Link
              key={tab.label}
              href={`/requests/${id}${tab.href}`}
              className={`step ${tab.done ? "done" : ""}`}
            >
              <span className="step-label">{tab.label}</span>
              {tab.sub && <span className="step-sub">{tab.sub}</span>}
            </Link>
          ),
        )}
      </nav>

      {!posture.clear && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          <div className="notice-title">
            Execution is blocked — {posture.unreviewedCount} legal-retention
            obligation{posture.unreviewedCount === 1 ? "" : "s"} not yet reviewed
          </div>
          <div>
            Part of this Data Principal&apos;s data is protected by a statutory
            retention obligation. Review each one before any deletion action, and
            note that deletion is field-level: acknowledging an obligation
            withholds only the fields it covers, not the whole record.{" "}
            <Link href={`/requests/${id}/retention`}>Review now →</Link>
          </div>
        </div>
      )}

      {children}
    </Shell>
  );
}
