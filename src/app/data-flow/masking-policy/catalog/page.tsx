import Link from "next/link";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { MaskFunctionsDrawer } from "@/components/maskingpolicy/MaskFunctionsDrawer";
import { DataCatalog } from "@/components/maskingpolicy/DataCatalog";
import { getDataCatalog } from "@/lib/engines/maskingpolicy";

export const dynamic = "force-dynamic";

const MP = "/data-flow/masking-policy";

/** DATA CATALOG — read-only. What data your applications handle, how sensitive it
 *  is, and whether the active policy protects it. Reflects the active version only. */
export default async function CatalogPage() {
  const data = await getDataCatalog();
  const c = data.counts;
  const notInUse = c.notDecided + c.notUsed;

  // Level 1 sentence, computed.
  let sentence: React.ReactNode;
  if (data.activeNumber == null) {
    sentence = <>{c.found} fields found in your applications. No policy is active yet, so every field is fully hidden. <Link href={MP} className="row-link">Review recommended policy</Link></>;
  } else if (notInUse === 0) {
    sentence = <>All {c.found} fields are in use in version {data.activeNumber}.</>;
  } else {
    const parts: React.ReactNode[] = [];
    if (c.notDecided > 0) parts.push(<Link key="d" href={`${MP}?view=workspace&focus=decisions`} className="row-link">{c.notDecided} need a decision</Link>);
    if (c.notUsed > 0) parts.push(<span key="u">{c.notUsed} marked not used</span>);
    sentence = <>{c.found} fields found in your applications. {c.inUse} are in use in version {data.activeNumber}. {notInUse} aren&rsquo;t: {parts.map((p, i) => <span key={i}>{i > 0 ? " and " : ""}{p}</span>)}.</>;
  }

  return (
    <Shell active="/data-flow/masking-policy" title="Data catalog">
      <PageHead
        title="Data catalog"
        subtitle={<span>{sentence}</span>}
        actions={<span className="row" style={{ gap: 14, alignItems: "center" }}><MaskFunctionsDrawer /><Link href={MP} className="row-link">Open masking policy</Link></span>}
      />
      <div className="stack" style={{ gap: 10, maxWidth: 1040 }}>
        {c.regulated > 0 && <p className="cell-sub" style={{ margin: 0 }}>{c.regulated} fields are protected by law and can never be shown in full.</p>}
        {data.draftNumber != null && <p className="cell-sub" style={{ margin: 0 }}>Draft {data.draftNumber} is in progress. This page shows the active version {data.activeNumber}. <Link href={`${MP}?view=workspace`} className="row-link">Open draft</Link></p>}
        <DataCatalog data={data} />
      </div>
    </Shell>
  );
}
