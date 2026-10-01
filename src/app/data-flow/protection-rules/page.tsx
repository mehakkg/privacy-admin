import Link from "next/link";
import { BookOpen } from "lucide-react";
import { formatDateTime, PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { getCurrentRole } from "@/lib/session";
import { EnforcementNotice } from "@/components/masking/EnforcementNotice";
import { ByFieldTab, type ByFieldSP } from "@/components/masking/ByFieldTab";
import { FieldDrawer } from "@/components/masking/FieldDrawer";
import type { CatalogField } from "@/components/masking/CreateRuleModal";
import { AddFieldDrawer } from "@/components/masking/AddFieldDrawer";
import { resolveField, getPendingChange, fieldHistory, associatedRegionalTemplates, getRuleGroups, getInventory, getCustomTemplates } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

const BASE = "/data-flow/protection-rules";

/**
 * PROTECTION RULES — one field-first table. Rule-group management, template
 * browsing and pending approvals all fold into this screen (multi-select action,
 * the drawer's View template, and a Status filter) — no tabs, no separate detail
 * page. The detail drawer reuses the product's List + Detail Drawer shell.
 */
export default async function ProtectionRulesPage({ searchParams }: { searchParams: Promise<ByFieldSP> }) {
  const sp = await searchParams;
  const role = await getCurrentRole();

  // Drawer data (right-side, URL-driven so deep links survive refresh).
  const drawerCode = sp.field?.toUpperCase();
  const [res, regional] = await Promise.all([
    drawerCode ? resolveField(drawerCode) : Promise.resolve(null),
    sp.add ? associatedRegionalTemplates() : Promise.resolve([]),
  ]);
  const pendingRaw = res ? await getPendingChange(res.code) : null;
  const pending = pendingRaw ? { ...pendingRaw, proposedAt: formatDateTime(pendingRaw.proposedAt) } : null;
  const historyRows = res ? await fieldHistory(res.code) : [];
  // originated_from_group_id + diverged_from_group for this field.
  const groups = res ? await getRuleGroups() : [];
  const grp = res ? groups.find((g) => g.memberCodes.includes(res.code)) ?? null : null;
  const diverged = grp ? grp.divergedCodes.includes(res!.code) : false;
  // Custom templates (Move-to-template targets) + the full field catalog (Duplicate
  // needs to pick another field). Only loaded when the drawer is open.
  const [customTemplates, invForCatalog] = res
    ? await Promise.all([getCustomTemplates(), getInventory()])
    : [[], []];
  const fullCatalog: CatalogField[] = invForCatalog.map((r) => ({ code: r.code, name: r.name, sensitivity: r.sensitivity, source: r.governedBy?.badge ?? (r.status === "ambiguous" ? "Ambiguous" : "No rule"), systemRegulated: !!r.governedBy?.systemRegulated, sampleValue: r.sampleValue }));

  const closeParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "field" && k !== "add" && k !== "created") closeParams.set(k, String(v));
  const cp = closeParams.toString();
  const closeHref = cp ? `${BASE}?${cp}` : BASE;

  return (
    <Shell active="/data-flow/protection-rules" title="Protection rules">
      <PageHead
        crumbs={[{ label: "Governance" }, { label: "Protection rules" }]}
        title="Protection rules"
        subtitle="Define how sensitive data is masked, shown, and governed across your organization."
        actions={<Link href="/audit?module=masking" className="row-link" style={{ gap: 6, alignItems: "center" }}><BookOpen size={15} /> Rule guide</Link>}
      />
      <EnforcementNotice />

      <ByFieldTab sp={sp} />

      {res && <FieldDrawer res={res} pending={pending} history={historyRows.map((h) => ({ seq: h.seq, action: h.action, actor: h.actorLabel, at: formatDateTime(h.timestamp) }))} role={role} closeHref={closeHref} groupId={grp?.id ?? null} groupName={grp?.name ?? null} diverged={diverged} customTemplates={customTemplates} fullCatalog={fullCatalog} autoDo={sp.do ?? null} />}
      {sp.add && <AddFieldDrawer closeHref={closeHref} regionalNames={regional.map((t) => t.name)} />}
    </Shell>
  );
}
