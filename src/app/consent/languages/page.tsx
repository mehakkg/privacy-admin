import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Notice } from "@/components/ui";
import { LanguageManager, type NoticeOpt, type VariantInfo } from "@/components/consentInfra/LanguageManager";
import { EIGHTH_SCHEDULE_LANGUAGES } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

/** SCREEN 6 — Language Variant Management across the 22 Eighth Schedule languages. */
export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const notices = await db.notice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (notices.length === 0) {
    return (
      <Shell active="/consent/languages" title="Consent / Language variants">
        <PageHead title="Language variant management" />
        <Notice tone="info" title="No notices yet">Create a notice first — language variants are managed per notice.</Notice>
      </Shell>
    );
  }
  const noticeId = notice && notices.some((n) => n.id === notice) ? notice : notices[0].id;
  const chosen = notices.find((n) => n.id === noticeId)!;
  const variants = await db.noticeVariant.findMany({ where: { noticeId }, select: { language: true, publishStatus: true } });

  const opts: NoticeOpt[] = notices;
  const v: VariantInfo[] = variants;

  return (
    <Shell active="/consent/languages" title="Consent / Language variants">
      <PageHead title="Language variant management" titleTip="See which of the 22 Eighth Schedule language variants exist and which are missing, and generate the missing ones." />
      <LanguageManager notices={opts} noticeId={noticeId} noticeName={chosen.name} languages={[...EIGHTH_SCHEDULE_LANGUAGES]} variants={v} />
    </Shell>
  );
}
