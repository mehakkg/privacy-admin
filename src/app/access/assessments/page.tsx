import { db } from "@/lib/db";
import { PageHead, formatDate } from "@/components/ui";
import { Assessments, type CampaignView } from "@/components/access/assessments";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

interface GrantContext { user?: string; role?: string; approvedBy?: string; grantedAt?: string; justification?: string }

/** SCREEN — Assessments: periodic certification campaigns. Distinct from Drift
 *  and Insights: asks whether access is still JUSTIFIED, regardless of drift or
 *  usage. Scope is a snapshot taken at campaign start. */
export default async function AssessmentsPage() {
  const campaigns = await db.certificationCampaign.findMany({
    include: { items: { include: { assignment: { include: { role: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();

  const views: CampaignView[] = campaigns.map((c) => {
    const reviewed = c.items.filter((i) => i.decision).length;
    const overdue = c.status !== "complete" && c.dueDate.getTime() < now && reviewed < c.items.length;
    return {
      id: c.id,
      name: c.name,
      dueDate: formatDate(c.dueDate),
      status: c.status === "complete" ? "complete" : overdue ? "overdue" : "in_progress",
      reviewed,
      total: c.items.length,
      items: c.items.map((i) => {
        const ctx = decodeObject<GrantContext>(i.originalGrantContextJson) ?? {};
        return {
          id: i.id,
          user: i.assignment.userName,
          role: i.assignment.role.name,
          reviewer: i.reviewerId,
          approvedBy: ctx.approvedBy ?? "—",
          grantedAt: ctx.grantedAt ? formatDate(new Date(ctx.grantedAt)) : "—",
          justification: ctx.justification ?? "—",
          decision: i.decision,
        };
      }),
    };
  });

  const reviewers = [...new Set(views.flatMap((v) => v.items.map((i) => i.reviewer)))].sort();

  return (
    <div className="stack">
      <PageHead
        title="Access Assessments"
        titleTip="Periodic certification campaigns. Each reviewer certifies or revokes the access in their scope, seeing the original grant context up front. A campaign can't be completed while any item is unreviewed."
      />
      <Assessments campaigns={views} reviewers={reviewers} />
    </div>
  );
}
