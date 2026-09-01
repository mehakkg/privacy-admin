import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { RotReview, type RotRow } from "@/components/duplicateReview";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6b — ROT resolution, as list + detail.
 *
 * The list stays a plain sortable table; the score, the last-accessed date and
 * the required reason live in the panel for the one candidate being decided.
 */
export default async function RotPage() {
  const candidates = await db.rOTCandidate.findMany({
    include: { field: { include: { source: true } } },
    orderBy: [{ resolution: "asc" }, { businessValueScore: "asc" }],
  });

  const rows: RotRow[] = candidates.map((c) => ({
    id: c.id,
    fieldPath: c.field.fieldPath,
    sourceName: c.field.source.name,
    businessValueScore: c.businessValueScore,
    lastAccessed: c.lastAccessed ? formatDate(c.lastAccessed) : null,
    reason: c.reason,
    resolution: c.resolution,
    resolutionReason: c.resolutionReason,
  }));

  const open = rows.filter((r) => r.resolution === "unresolved").length;

  return (
    <Shell active="/discovery" title="Discovery / ROT">
      <PageHead
        crumbs={[
          { label: "Data Discovery", href: "/discovery" },
          { label: "Triage", href: "/discovery/triage?tab=rot" },
          { label: "ROT" },
        ]}
        title="Redundant, obsolete, trivial"
        titleTip="Data with little business value that is still held. Keeping personal data longer than its purpose needs is a compliance exposure, not just a storage cost."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open" value={open} tone={open ? "yellow" : undefined} />
        <Stat label="Resolved" value={rows.length - open} />
      </div>

      <RotReview rows={rows} />
    </Shell>
  );
}
