import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { PageHead, Notice } from "@/components/ui";
import { db } from "@/lib/db";
import { EnforcementBanner } from "@/components/masking/EnforcementBanner";
import { EditRule } from "@/components/masking/EditRule";
import { getRuleForEdit } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

/**
 * SCREEN 3 — Edit an editable masking rule.
 *
 * View-only rules (baseline/regional) and locked rules are refused here with the
 * reason, not a broken form — the edit surface only opens for a rule a tenant can
 * genuinely change.
 */
export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rule = await getRuleForEdit(id);
  if (!rule) notFound();

  const field = await db.maskingField.findUnique({ where: { code: rule.fieldCode } });
  const sampleValue = field?.sampleValue ?? "";

  const blocked =
    !rule.editable
      ? { title: "This rule is view-only", body: `The ${rule.template.name} rule for ${rule.fieldCode} is not editable by this tenant. It resolves as a floor or an association, and can only be changed by its owner.` }
      : rule.lockType === "system_regulated"
        ? { title: "System-regulated — cannot be edited", body: `${rule.fieldCode} is owned by SUPER_ADMIN. No tenant can edit, override, or unlock it.` }
        : rule.lockType === "self_locked"
          ? { title: "Locked — unlock before editing", body: `${rule.fieldCode} is self-locked by your team. Unlock it from the field lookup, then edit.` }
          : null;

  return (
    <Shell active="/masking/fields" title="Dynamic Data Masking">
      <PageHead
        crumbs={[{ label: "Masking fields", href: "/masking/fields" }, { label: rule.fieldCode, href: `/masking/fields?code=${rule.fieldCode}` }, { label: "Edit rule" }]}
        title={`Edit masking rule — ${rule.fieldCode}`}
      />
      <EnforcementBanner />

      {blocked ? (
        <Notice tone="warn" title={blocked.title}>
          {blocked.body}{" "}
          <Link href={`/masking/fields?code=${rule.fieldCode}`} className="row-link">Back to the field</Link>
        </Notice>
      ) : (
        <EditRule
          ruleId={rule.id}
          fieldCode={rule.fieldCode}
          fieldName={rule.fieldName}
          sampleValue={sampleValue}
          templateName={rule.template.name}
          tier={rule.template.tier}
          initialMethod={rule.method}
          initialVersion={rule.version}
        />
      )}
    </Shell>
  );
}
