import Link from "next/link";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { MaskFunctionsDrawer } from "@/components/maskingpolicy/MaskFunctionsDrawer";
import { CatalogTable, type CatalogGroup } from "@/components/maskingpolicy/CatalogTable";
import { getCategories, getActiveVersion, getDraft } from "@/lib/engines/maskingpolicy";
import { db } from "@/lib/db";
import { renderValue, choiceLabel, type Masking } from "@/lib/maskingpolicy";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const MP = "/data-flow/masking-policy";
const parse = (j: string | null): Masking | null => (j ? decodeObject<Masking>(j) : null) ?? null;

/** SCREEN E — PII catalog. Read-only reference + "In your policy". No actions. */
export default async function CatalogPage() {
  const [cats, platformFields, active, draft] = await Promise.all([
    getCategories(),
    db.mPField.findMany({ where: { origin: "platform" }, orderBy: { displayName: "asc" } }),
    getActiveVersion(), getDraft(),
  ]);
  const policyVersion = draft ?? active;
  const decisions = policyVersion ? await db.mPFieldDecision.findMany({ where: { versionId: policyVersion.id } }) : [];
  const decByCode = new Map(decisions.map((d) => [d.fieldCode, d]));
  const regulatedCount = platformFields.filter((f) => f.regulated).length;

  const groups: CatalogGroup[] = cats.map((c) => {
    const members = platformFields.filter((f) => f.categoryId === c.id);
    return {
      id: c.id, name: c.name, definition: c.definition,
      rows: members.map((f) => {
        const rec = f.regulated ? parse(f.legalMinimumJson) : { family: "partial", params: { showFirst: 0, showLast: 4, maskChar: "*" } } as Masking;
        const dec = decByCode.get(f.code);
        const inPolicy = !policyVersion ? "No policy yet" : !dec ? "Hidden, not decided" : dec.status === "not_used" ? "Not used" : dec.status === "needs_decision" ? "Hidden, not decided" : "Yes";
        return { code: f.code, name: f.displayName, example: renderValue(rec, f.sampleValue), recommended: choiceLabel(rec, false), inPolicy, href: policyVersion ? `${MP}?view=${draft ? "workspace&focus=field:" + f.code : "version&version=" + active?.number}` : null, regulated: f.regulated };
      }),
    };
  }).filter((g) => g.rows.length > 0);

  return (
    <Shell active="/data-flow/masking-policy" title="PII catalog">
      <PageHead
        title="PII catalog"
        subtitle={`${platformFields.length} fields across ${groups.length} categories. ${regulatedCount} are protected by law.`}
        actions={<span className="row" style={{ gap: 14, alignItems: "center" }}><span className="cell-sub">Catalog version 1 · read only</span><MaskFunctionsDrawer /><Link href={MP} className="row-link">Open masking policy</Link></span>}
      />
      <div className="stack" style={{ gap: 14, maxWidth: 960 }}>
        <p className="cell-sub" style={{ margin: 0 }}>Protected by law: masked to the legal minimum or hidden completely, never shown in full.</p>
        <CatalogTable groups={groups} />
        <p className="cell-sub" style={{ margin: 0 }}>Fields you added appear in your <Link href={MP} className="row-link">Masking policy</Link>.</p>
      </div>
    </Shell>
  );
}
