import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, InfoTip, Notice, PageHead } from "@/components/ui";
import { ImportWizard, GuidedQuestionnaire } from "@/components/importWizard";

export const dynamic = "force-dynamic";

/**
 * SCREEN 7 — Bulk Import & Guided Mapping.
 *
 * Independent of scanning: this is how data that no scanner can reach gets into
 * the inventory. The questionnaire scopes an initiative before any system
 * exists; the CSV path covers an inventory someone already keeps in a
 * spreadsheet.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode;

  return (
    <Shell active="/discovery" title="Discovery / Import">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Import" }]}
        title="Bulk import & guided mapping"
        titleTip="For data a scanner cannot reach: a new initiative that has no system yet, or an inventory someone already maintains by hand."
      />

      {!mode && (
        <div className="grid-2">
          <Card title="Guided questionnaire">
            <p className="cell-sub" style={{ marginTop: 0 }}>
              Step-by-step prompts to scope a new activity before any system
              exists.
            </p>
            <Link href="/discovery/import?mode=questionnaire" className="btn primary">
              Start questionnaire
            </Link>
          </Card>

          <Card title="Bulk CSV import">
            <p className="cell-sub" style={{ marginTop: 0 }}>
              Download the template, upload a filled sheet, map the columns, and
              review before anything is committed.
            </p>
            <Link href="/discovery/import?mode=csv" className="btn primary">
              Start import
            </Link>
          </Card>
        </div>
      )}

      {mode === "questionnaire" && (
        <Card
          title={
            <span className="row">
              Guided questionnaire
              <InfoTip
                align="left"
                text="Answers become inventory entries scoped to the activity, so a new initiative is on the record before it starts processing anything."
              />
            </span>
          }
        >
          <GuidedQuestionnaire />
        </Card>
      )}

      {mode === "csv" && (
        <Card title="Bulk CSV import">
          <Notice tone="info" title="Nothing is committed until you confirm">
            The preview step shows exactly what will be created, including any
            row that could not be mapped. Unmappable rows are never silently
            dropped.
          </Notice>
          <div style={{ marginTop: 14 }}>
            <ImportWizard />
          </div>
        </Card>
      )}
    </Shell>
  );
}
