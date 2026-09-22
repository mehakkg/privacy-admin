import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { NoticeReleaseWorkspace, type ReleaseView, type VariantView, type DeviceCell } from "@/components/consent/NoticeReleaseWorkspace";
import { baseHash } from "@/lib/engines/scenario6";
import { DEVICE_MATRIX } from "@/lib/scenario6";

export const dynamic = "force-dynamic";

/** SCREENS 4–6 — Notice release: regional/language variants, device rendering
 *  QA, and the publish gate (blocked until every variant's QA passes). */
export default async function NoticeReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = await db.notice.findUnique({ where: { id }, include: { variants: { include: { deviceChecks: true }, orderBy: { language: "asc" } } } });
  if (!notice) notFound();

  const currentBase = baseHash(notice.content ?? "");

  const variants: VariantView[] = notice.variants.map((vr) => {
    const byKey = new Map(vr.deviceChecks.map((c) => [`${c.device}|${c.browser}`, c]));
    const checks: DeviceCell[] = DEVICE_MATRIX.map((d) => {
      const c = byKey.get(`${d.device}|${d.browser}`);
      return c ? { id: c.id, device: c.device, browser: c.browser, method: c.method, status: c.status, detail: c.detail } : { id: null, device: d.device, browser: d.browser, method: d.method, status: "not_run", detail: null };
    });
    const stale = vr.inherit && vr.baseHashAtReview != null && vr.baseHashAtReview !== currentBase;
    return { id: vr.id, language: vr.language, inherit: vr.inherit, content: vr.content, publishStatus: vr.publishStatus, stale, checks };
  });

  const view: ReleaseView = { noticeId: notice.id, noticeName: notice.name, base: notice.content ?? "", variants };

  return (
    <Shell active="/consent/notices" title={`Consent & Notices / Release · ${notice.name}`}>
      <PageHead
        crumbs={[{ label: "Notices", href: "/consent/notices" }, { label: notice.name }]}
        title="Notice release"
        titleTip="Configure each regional/language variant (inherit base or override), run device rendering QA, and publish — the combined publish is blocked until every variant's QA passes."
      />
      {variants.length === 0
        ? <div className="empty">This notice has no language variants yet. Add them from the notice&apos;s Variants tab.</div>
        : <NoticeReleaseWorkspace v={view} />}
    </Shell>
  );
}
