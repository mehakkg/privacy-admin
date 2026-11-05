import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getCurrentRole } from "@/lib/session";
import { getActivitiesScreen } from "@/lib/engines/activities";
import { getPurposesView } from "@/lib/engines/purposes";

export const dynamic = "force-dynamic";

/**
 * My work (unified-nav §4.2) — one page for everything the current user must act
 * on across Privacy. This first version surfaces the Activities and Purposes
 * "You" items; the full cross-module aggregation (Requests, Breaches, Notices,
 * Escalations, Processors) lands with the §4 page merges.
 */
export default async function MyWorkPage() {
  const [role, screen, purposes] = await Promise.all([getCurrentRole(), getActivitiesScreen(), getPurposesView()]);
  const myActor = role === "dpo" ? "dpo" : role === "ciso" || role === "legal" ? "none" : "admin";
  const activities = screen.rows.filter((r) => r.actor === myActor && r.actor !== "none");
  const purposeRows = purposes.rows.filter((p) => (p.status === "pending" ? role === "dpo" : p.status === "draft" || p.status === "rejected" || p.notInNotice));

  const items = [
    ...activities.map((a) => ({ kind: "Activity", title: a.name, verb: a.next?.text ?? "Open", href: `/data-map/activities?activity=${a.id}`, source: "Activities" })),
    ...purposeRows.map((p) => ({ kind: "Purpose", title: p.name, verb: p.notInNotice ? "Add to notice" : p.status === "rejected" ? "Revise" : p.status === "pending" ? "Review" : "Submit for approval", href: `/data-map/purposes?purpose=${p.id}`, source: "Purposes" })),
  ];

  return (
    <Shell active="/my-work" title="My work">
      <div className="pa-list">
        <div className="pa-head"><div className="stack" style={{ gap: 4 }}>
          <h1 className="inv-title">My work</h1>
          <p className="cell-sub" style={{ margin: 0 }}>Everything across Privacy that needs you, in one place.</p>
        </div></div>

        {items.length === 0 ? (
          <div className="inv-noresult" style={{ marginTop: 16 }}>You’re clear.</div>
        ) : (
          <section className="stack" style={{ gap: 8, marginTop: 16 }}>
            <strong>You · {items.length}</strong>
            <div className="inv-card stack" style={{ gap: 0, padding: 0 }}>
              {items.map((it, i) => (
                <div key={i} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
                  <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
                    <span className="chip" style={{ fontSize: 10.5 }}>{it.kind}</span>
                    <span className="stack" style={{ gap: 0, minWidth: 0 }}><span className="av-name">{it.title}</span><span className="cell-sub">{it.source}</span></span>
                  </div>
                  <Link href={it.href} className="btn sec sm">{it.verb}</Link>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="cell-sub" style={{ marginTop: 14 }}>Requests, Breaches, Notices, Escalations and Processors join this list as the page merges land.</p>
      </div>
    </Shell>
  );
}
