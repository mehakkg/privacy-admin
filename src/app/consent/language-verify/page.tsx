import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { LanguageSimulator } from "@/components/consentInfra/LanguageSimulator";
import { EIGHTH_SCHEDULE_LANGUAGES } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

/** SCREEN 6 — Language-detection banner verification against the managed
 *  Scenario-8 variant set, with a defined fallback. */
export default async function LanguageVerifyPage() {
  const notice = await db.notice.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const variants = notice ? await db.noticeVariant.findMany({ where: { noticeId: notice.id }, select: { language: true } }) : [];
  // Managed variants + English base are "available".
  const available = ["English", ...variants.map((v) => v.language)];
  // Simulate the 22 target languages + English + two genuinely unsupported ones.
  const simulatable = ["Hindi", "Tamil", "Bengali", "English", ...EIGHTH_SCHEDULE_LANGUAGES.filter((l) => !["Hindi", "Tamil", "Bengali"].includes(l)), "French", "Spanish"];

  return (
    <Shell active="/consent/language-verify" title="Consent / Language verification">
      <PageHead title="Language-detection banner verification" titleTip="Simulate a visitor's language and confirm the banner appears in their language from the managed variant set, with a defined fallback when unavailable." />
      <LanguageSimulator available={available} simulatable={[...new Set(simulatable)]} />
    </Shell>
  );
}
