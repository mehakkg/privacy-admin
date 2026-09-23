import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { RopaRecommendations, type RopaRow } from "@/components/ropaRecommendations";

export const dynamic = "force-dynamic";

const TABS = ["pending", "accepted", "dismissed"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { pending: "Pending", accepted: "Accepted", dismissed: "Dismissed" };

/**
 * ROPA RECOMMENDATIONS — AI-suggested entries for the formal RoPA register,
 * generated from what Discovery has already scanned and classified. A read +
 * review layer: each suggestion is a grouping of approved ClassifiedFields by
 * (source, purpose, subject type) that a human accepts into the register or
 * dismisses. Distinct from Processing Activities, the human-maintained table.
 */
export default async function RopaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(params.status ?? "") ? (params.status as Tab) : "pending";

  const [suggestions, counts, coverageFields] = await Promise.all([
    db.ropaSuggestion.findMany({ where: { status: tab }, include: { source: true, purposeTag: true }, orderBy: { generatedAt: "desc" } }),
    db.ropaSuggestion.groupBy({ by: ["status"], _count: true }),
    // Coverage = discovered PII types with governed purpose linkage / all types.
    db.classifiedField.findMany({ select: { category: true, detectedType: true, purposeTagId: true } }),
  ]);
  const countBy = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  const typeKey = (f: { category: string | null; detectedType: string }) => f.category ?? f.detectedType ?? "unknown";
  const allTypes = new Set(coverageFields.map(typeKey));
  const governedTypes = new Set(coverageFields.filter((f) => f.purposeTagId).map(typeKey));
  const totalTypes = allTypes.size;
  const coveredTypes = [...allTypes].filter((t) => governedTypes.has(t)).length;
  const coveragePct = totalTypes ? Math.round((coveredTypes / totalTypes) * 100) : 100;
  const uncovered = totalTypes - coveredTypes;

  // One fetch for every field referenced by the visible suggestions.
  const allIds = suggestions.flatMap((s) => { try { return JSON.parse(s.fieldIdsJson || "[]") as string[]; } catch { return []; } });
  const fields = allIds.length
    ? await db.classifiedField.findMany({ where: { id: { in: [...new Set(allIds)] } }, select: { id: true, fieldPath: true, detectedType: true, sensitivityTier: true, confidence: true } })
    : [];
  const fieldById = new Map(fields.map((f) => [f.id, f]));

  const rows: RopaRow[] = suggestions.map((s) => {
    const ids = (() => { try { return JSON.parse(s.fieldIdsJson || "[]") as string[]; } catch { return []; } })();
    const sfields = ids.map((id) => fieldById.get(id)).filter(Boolean) as { fieldPath: string; detectedType: string; sensitivityTier: string; confidence: string }[];
    // Confidence: share of high-confidence classifications in the grouping.
    const highShare = sfields.length ? sfields.filter((f) => f.confidence === "high").length / sfields.length : 0;
    const confidence = highShare >= 0.7 ? "high" : highShare >= 0.4 ? "medium" : "low";
    return {
      id: s.id,
      sourceName: s.source.name,
      purposeName: s.purposeTag?.name ?? null,
      subjectType: s.dataSubjectType,
      fieldCount: ids.length,
      generated: formatDate(s.generatedAt),
      status: s.status,
      dismissedReason: s.dismissedReason,
      activityId: s.activityId,
      confidence,
      fields: sfields.map((f) => ({ path: f.fieldPath, type: f.detectedType, sensitivity: f.sensitivityTier })),
    };
  });

  return (
    <Shell active="/discovery/ropa" title="Data Map / ROPA recommendations">
      <PageHead
        title="ROPA recommendations"
        titleTip="AI-suggested RoPA register entries, generated from approved Discovery classifications and grouped by source · purpose · subject type. Distinct from Processing Activities — these are suggestions competing for a spot in that register, accepted or dismissed by a human."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="ROPA coverage" value={`${coveragePct}%`} tone={coveragePct >= 80 ? "green" : coveragePct >= 50 ? "yellow" : "red"} />
        <Stat label="PII types uncovered" value={uncovered} tone={uncovered ? "yellow" : "green"} />
        <Stat label="Pending" value={countBy("pending")} tone={countBy("pending") ? "yellow" : undefined} />
        <Stat label="Accepted" value={countBy("accepted")} />
        <Stat label="Dismissed" value={countBy("dismissed")} />
      </div>
      <div className="notice info compact" style={{ marginBottom: 16 }}>
        <span><strong>{coveragePct}% coverage</strong> — {coveredTypes} of {totalTypes} discovered PII types have a governed purpose linkage; {uncovered} still uncovered. Promote suggestions below to close the gap.</span>
      </div>

      <nav className="stepper" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t} href={`/discovery/ropa?status=${t}`} className={`step${t === tab ? " active" : ""}`}>
            <span className="step-label">{TAB_LABEL[t]}</span>
          </Link>
        ))}
      </nav>

      <RopaRecommendations rows={rows} tab={tab} />
    </Shell>
  );
}
