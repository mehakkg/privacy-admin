import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Notice } from "@/components/ui";
import { LanguageQAMatrix, type NoticeOpt, type VariantView } from "@/components/consentInfra/LanguageQAMatrix";

export const dynamic = "force-dynamic";

/** SCREEN 7 — Language Rendering QA. Extends the Device Rendering QA matrix with
 *  a language dimension, reusing the same NoticeDeviceCheck engine. */
export default async function LanguageQAPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const notices = await db.notice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (notices.length === 0) {
    return (
      <Shell active="/consent/language-qa" title="Consent / Language QA">
        <PageHead title="Language rendering QA" />
        <Notice tone="info" title="No notices yet">Create a notice and its language variants first.</Notice>
      </Shell>
    );
  }
  const noticeId = notice && notices.some((n) => n.id === notice) ? notice : notices[0].id;
  const chosen = notices.find((n) => n.id === noticeId)!;
  const variants = await db.noticeVariant.findMany({ where: { noticeId }, orderBy: { language: "asc" }, include: { deviceChecks: true } });

  const opts: NoticeOpt[] = notices;
  const v: VariantView[] = variants.map((x) => ({
    id: x.id, language: x.language, publishStatus: x.publishStatus,
    checks: x.deviceChecks.map((c) => ({ id: c.id, device: c.device, browser: c.browser, method: c.method, status: c.status, detail: c.detail })),
  }));

  return (
    <Shell active="/consent/language-qa" title="Consent / Language QA">
      <PageHead title="Language rendering QA" titleTip="Verify each language variant renders correctly across devices — the same QA engine as Device Rendering QA, with language as a filterable dimension." />
      <LanguageQAMatrix notices={opts} noticeId={noticeId} noticeName={chosen.name} variants={v} />
    </Shell>
  );
}
