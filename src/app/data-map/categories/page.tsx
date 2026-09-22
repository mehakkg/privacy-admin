import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { CategoriesManager, type FieldLite, type CategoryLite, type Opt } from "@/components/datamap/CategoriesManager";

export const dynamic = "force-dynamic";

/** SCREENS 2 + 3 (+ bulk tag) — Data Category Management: named groupings of
 *  fields, and bulk-tagging a whole category to a purpose in one action. */
export default async function CategoriesPage() {
  const [cats, fields, purposes, processors] = await Promise.all([
    db.dataCategory.findMany({ include: { _count: { select: { fields: true } } }, orderBy: { name: "asc" } }),
    db.classifiedField.findMany({ include: { source: { select: { name: true } }, purposeTag: { select: { name: true } } }, orderBy: { fieldPath: "asc" }, take: 500 }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true, retention: true, lawfulBasis: true } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const categories: CategoryLite[] = cats.map((c) => ({ id: c.id, name: c.name, description: c.description, memberCount: c._count.fields }));
  const fieldRows: FieldLite[] = fields.map((f) => ({ id: f.id, fieldPath: f.fieldPath, sourceName: f.source.name, purposeName: f.purposeTag?.name ?? null, categoryId: f.dataCategoryId }));
  const purposeOpts: Opt[] = purposes.map((p) => ({ id: p.id, name: p.name, retention: p.retention, lawfulBasis: p.lawfulBasis }));
  const processorOpts: Opt[] = processors.map((p) => ({ id: p.id, name: p.name }));

  return (
    <Shell active="/data-map/categories" title="Data Map / Data categories">
      <PageHead title="Data categories" titleTip="Group related fields into named categories, then tag the whole category to a purpose at once instead of field by field. Deleting a category reverts its fields to ungrouped — it never deletes the fields." />
      <CategoriesManager categories={categories} fields={fieldRows} purposes={purposeOpts} processors={processorOpts} />
    </Shell>
  );
}
