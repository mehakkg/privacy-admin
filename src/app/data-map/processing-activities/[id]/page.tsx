import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { getActivityList } from "@/lib/engines/activities";

export const dynamic = "force-dynamic";

const LIST = "/data-map/processing-activities";
const LIFECYCLE_LABEL: Record<string, string> = { draft: "Draft", pending_dpo_review: "Waiting for DPO review", active: "Active", under_review: "Under review", retired: "Retired" };

/**
 * Workspace (read-only preview). The full editable workspace — rail, panes,
 * autosave — lands in the next milestone (M3). This keeps the route live and
 * shows where the activity stands.
 */
export default async function ActivityWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getActivityList({ segment: "all" });
  const row = view.rows.find((r) => r.id === id);
  if (!row) notFound();

  return (
    <Shell active="/data-map/processing-activities" title={row.name}>
      <div style={{ maxWidth: 760 }}>
        <Link href={LIST} className="row-link">← Processing activities</Link>
        <PageHead title={row.name} />
        <p className="cell-sub" style={{ marginTop: -6 }}>{[row.owner ?? "No owner", row.department].filter(Boolean).join(" · ")} · {LIFECYCLE_LABEL[row.lifecycle]}</p>
        <p className="cell-sub">{row.summary}</p>
        <p style={{ fontWeight: 500 }}>{row.completenessKind === "complete" ? "Ready for ROPA" : row.completenessLabel}{row.next.actionable && row.next.verb ? ` — ${row.next.verb}` : ""}</p>
        <Notice tone="info" title="Workspace is being built">
          The full activity workspace — Basics, Purposes with Data and Processors, and Review and activate — arrives in the next step. For now this shows where the activity stands.
        </Notice>
      </div>
    </Shell>
  );
}
