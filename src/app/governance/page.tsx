import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, GovernanceBanner, PageHead, Pill, formatDate } from "@/components/ui";
import { decodeList } from "@/lib/codec/json";
import { GOVERNANCE_OWNER } from "@/lib/guards/escalationGate";
import { ROLE_LABEL } from "@/lib/domain";
import { getCurrentRole } from "@/lib/session";
import { PurposeTaxonomy } from "@/components/PurposeTaxonomy";
import { RoleDefinitions } from "@/components/access/roleDefinitions";
import type { RoleView } from "@/components/access/roleDetailDrawer";

export const dynamic = "force-dynamic";

/**
 * Governance-owned objects, read-only (acceptance criterion 6).
 *
 * Purposes, notice versions, cookie categories and protection rules are created
 * and approved by the DPO and CISO. Admin implements them.
 *
 * There is no edit control on this page, and there is no mutation function for
 * these models anywhere in src/ — lib/db.ts refuses a write to any of them
 * outright, so read-only is a property of the system rather than of this
 * screen's markup. The banner makes the distinction visible: this is approved
 * policy being implemented, not configuration Admin owns.
 *
 * The DPO and CISO modules do not exist in this build; these rows come from the
 * seed, which stands in for them.
 */
export default async function GovernancePage() {
  const role = await getCurrentRole();
  const isDpo = role === "dpo";
  const [purposes, notices, cookies, rules, roles] = await Promise.all([
    db.purposeTag.findMany({ orderBy: { name: "asc" } }),
    db.noticeVersion.findMany({ orderBy: { version: "desc" } }),
    db.cookieCategory.findMany({ orderBy: { name: "asc" } }),
    db.protectionRule.findMany({ orderBy: { dataCategory: "asc" } }),
    // Ratified roles only: system, or approved custom. Drafts/pending don't appear.
    db.rBACRole.findMany({
      where: { OR: [{ roleType: "system" }, { roleType: "custom", status: "approved" }] },
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
    }),
  ]);

  const roleViews: RoleView[] = roles.map((r) => ({
    id: r.id, name: r.name, description: r.description, roleType: r.roleType, status: r.status,
    capabilityIds: decodeList(r.capabilitiesJson), createdBy: r.createdBy,
    approvedBy: r.baselineApprovedBy, approvedAt: r.baselineApprovedAt ? formatDate(r.baselineApprovedAt) : null, holders: 0,
  }));

  return (
    <Shell active="/governance" title="Approved Policy">
      <PageHead
        title="Approved policy"
        subtitle="Governance objects Admin implements but does not author. Shown here so the technical work can be checked against what was actually approved."
      />

      <div className="stack">
        <Card title="Specified purposes">
          {isDpo ? (
            <div className="notice policy" style={{ marginBottom: 12 }}>
              <div className="notice-title">You are acting as the DPO</div>
              <div>
                This is your object to define. Add or retire purposes below; Admin
                sees the same table read-only and can only request additions.
              </div>
            </div>
          ) : (
            <GovernanceBanner
              owner={ROLE_LABEL[GOVERNANCE_OWNER.PurposeTag]}
              object="The purpose catalogue"
            />
          )}
          <div style={{ marginTop: 12 }}>
            <PurposeTaxonomy
              canEdit={isDpo}
              purposes={purposes.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                status: p.status,
                approvedBy: p.approvedBy,
                approvedAt: formatDate(p.approvedAt),
              }))}
            />
          </div>
        </Card>

        <Card title="Notice versions">
          <GovernanceBanner
            owner={ROLE_LABEL[GOVERNANCE_OWNER.NoticeVersion]}
            object="Notice content"
          />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Title</th>
                  <th>Regions</th>
                  <th>Languages</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id}>
                    <td className="mono">{n.version}</td>
                    <td className="cell-primary">{n.title}</td>
                    <td>
                      {decodeList(n.publishedRegionsJson).length
                        ? decodeList(n.publishedRegionsJson).join(", ")
                        : "Not published"}
                    </td>
                    <td className="cell-sub">
                      {decodeList(n.languagesJson).join(", ")}
                    </td>
                    <td>
                      <Pill tone={n.status === "published" ? "green" : "yellow"}>
                        {n.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Cookie categories">
          <GovernanceBanner
            owner={ROLE_LABEL[GOVERNANCE_OWNER.CookieCategory]}
            object="Cookie category policy"
          />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Default state</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {cookies.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-primary">{c.name}</td>
                    <td className="muted">{c.description}</td>
                    <td>
                      <Pill tone={c.defaultState === "on" ? "blue" : "gray"}>
                        {c.defaultState}
                      </Pill>
                    </td>
                    <td className="cell-sub">
                      {c.approvedBy} · {formatDate(c.approvedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Protection rules">
          <GovernanceBanner
            owner={ROLE_LABEL[GOVERNANCE_OWNER.ProtectionRule]}
            object="Protection rule definitions"
          />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Data category</th>
                  <th>Rule</th>
                  <th>Scope</th>
                  <th>Definition</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-primary">{r.dataCategory}</td>
                    <td>
                      <Pill
                        tone={
                          r.ruleType === "encrypt"
                            ? "purple"
                            : r.ruleType === "dlp"
                              ? "red"
                              : "blue"
                        }
                        dot={false}
                      >
                        {r.ruleType}
                      </Pill>
                    </td>
                    <td className="cell-sub">{r.scope}</td>
                    <td className="muted">{r.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Role definitions">
          <GovernanceBanner owner="the Data Protection Officer / CISO" object="Role definitions" />
          <div style={{ marginTop: 12 }}>
            <RoleDefinitions roles={roleViews} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}
