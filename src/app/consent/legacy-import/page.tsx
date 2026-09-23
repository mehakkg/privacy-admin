import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { LegacyImportForm, type PurposeOpt, type EntityOpt, type TemplateOpt } from "@/components/consentInfra/LegacyImportForm";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** SCREEN 2 — Legacy Consent Bulk Import with honest provenance flagging. */
export default async function LegacyImportPage() {
  const [purposes, entities, templates] = await Promise.all([
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.legacyImportTemplate.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const p: PurposeOpt[] = purposes;
  const e: EntityOpt[] = entities;
  const t: TemplateOpt[] = templates.map((x) => ({ id: x.id, name: x.name, sourceSystem: x.sourceSystem, mapping: decodeObject<{ legacyField: string; schemaField: string }[]>(x.mappingJson) ?? [] }));

  return (
    <Shell active="/consent/legacy-import" title="Consent / Legacy import">
      <PageHead title="Legacy consent bulk import" titleTip="Bring in consent from a retiring legacy system without forcing re-consent — while being honest about which capture dates can and can't be verified." />
      <LegacyImportForm purposes={p} entities={e} templates={t} />
    </Shell>
  );
}
