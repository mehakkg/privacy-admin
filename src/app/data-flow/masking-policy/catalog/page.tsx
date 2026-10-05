import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { MaskFunctionsDrawer } from "@/components/maskingpolicy/MaskFunctionsDrawer";
import { getCategories } from "@/lib/engines/maskingpolicy";
import { db } from "@/lib/db";
import { renderValue } from "@/lib/maskingpolicy";
import { decodeObject } from "@/lib/codec/json";
import type { Masking } from "@/lib/maskingpolicy";

export const dynamic = "force-dynamic";

/** SCREEN 9 — PII Catalog. Read-only reference, grouped by the shared category
 *  header. Masking functions move into a drawer. No policy actions here. */
export default async function CatalogPage() {
  const [cats, fields] = await Promise.all([getCategories(), db.mPField.findMany({ orderBy: { displayName: "asc" } })]);

  return (
    <Shell active="/data-flow/masking-policy" title="PII catalog">
      <PageHead
        crumbs={[{ label: "Governance" }, { label: "Masking policy", href: "/data-flow/masking-policy" }, { label: "PII catalog" }]}
        title="PII catalog"
        subtitle="Every sensitive field your applications can produce, grouped by what the data is."
        actions={<MaskFunctionsDrawer />}
      />
      <div className="stack" style={{ gap: 16, maxWidth: 900 }}>
        {cats.map((c) => {
          const members = fields.filter((f) => f.categoryId === c.id);
          if (members.length === 0) return null;
          return (
            <section key={c.id} className="mp-card">
              <h4 className="mp-card-h">{c.name}</h4>
              <p className="cell-sub" style={{ margin: "0 0 10px" }}>{c.definition}</p>
              <div className="table-wrap"><table className="dtable compact">
                <thead><tr><th>Field</th><th>Code</th><th>Sample (made up)</th><th /></tr></thead>
                <tbody>
                  {members.map((f) => (
                    <tr key={f.code}>
                      <td>{f.displayName}{f.origin === "your_organization" && <span className="mp-tag" style={{ marginLeft: 6 }}>Added by your organization</span>}</td>
                      <td className="mono cell-sub">{f.code}</td>
                      <td className="mono cell-sub">{f.sampleValue}</td>
                      <td>{f.regulated && <span className="mp-tag lock"><Lock size={9} /> Regulated · {renderValue(decodeObject<Masking>(f.legalMinimumJson ?? "") ?? null, f.sampleValue)} minimum</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>
          );
        })}
      </div>
      <p className="cell-sub" style={{ marginTop: 14 }}><Link href="/data-flow/masking-policy" className="row-link">Back to Masking policy</Link></p>
    </Shell>
  );
}
