import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, GovernanceBanner, PageHead, Pill, Stat } from "@/components/ui";
import { ScriptMapper, CookieFindings, BannerConfig } from "@/components/cookieConfig";
import { ROLE_LABEL } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * COOKIE CONSENT — one page, two tab groups.
 *
 * Configuration is one-time-ish setup; Monitoring runs on a recurring cadence.
 * Categories and their default states are policy-locked (governance-owned); the
 * script-to-category mapping is the one thing Admin edits. Scan findings reuse
 * the Discovery triage drawer — an undisclosed script is structurally the same
 * "flagged item needing a decision" as a low-confidence PII field.
 */
export default async function CookieConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "monitoring" ? "monitoring" : "configuration";

  const [categories, scripts, findings] = await Promise.all([
    db.cookieCategory.findMany({ orderBy: { name: "asc" } }),
    db.cookieScript.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    db.cookieScanFinding.findMany({ orderBy: { firstSeen: "desc" } }),
  ]);

  const undisclosed = findings.filter((f) => !f.disclosed && f.status === "open").length;

  return (
    <Shell active="/consent" title="Consent & Notices / Cookie consent">
      <PageHead
        title="Cookie consent"
        titleTip="Configure how cookies are categorised and consented, and monitor the site for scripts that fire without disclosure."
        actions={
          <Link href="/audit" className="btn sm">
            Export compliance report
          </Link>
        }
      />

      <nav className="stepper">
        <Link href="/consent/cookies" className={`step${tab === "configuration" ? " active" : ""}`}>
          <span className="step-label">Configuration</span>
        </Link>
        <Link href="/consent/cookies?tab=monitoring" className={`step${tab === "monitoring" ? " active" : ""}`}>
          <span className="step-label">Monitoring</span>
          {undisclosed > 0 && <span className="step-sub">{undisclosed} undisclosed</span>}
        </Link>
      </nav>

      {tab === "configuration" ? (
        <div className="stack">
          <Card title="Categories">
            <GovernanceBanner owner={ROLE_LABEL.dpo} object="Cookie categories and their default states" />
            <p className="cell-sub" style={{ marginTop: 12 }}>
              Category name and default state are set by the DPO. The scripts
              mapped to each category are the part you configure.
            </p>
            <div style={{ marginTop: 12 }}>
              <ScriptMapper
                categories={categories.map((c) => ({ id: c.id, name: c.name, defaultState: c.defaultState }))}
                scripts={scripts.map((s) => ({
                  id: s.id,
                  name: s.name,
                  vendor: s.vendor,
                  page: s.page,
                  categoryId: s.categoryId,
                }))}
              />
            </div>
          </Card>

          <Card title="Banner">
            <BannerConfig />
          </Card>
        </div>
      ) : (
        <div className="stack">
          <div className="stat-row">
            <Stat label="Scripts seen" value={findings.length} />
            <Stat label="Undisclosed" value={undisclosed} tone={undisclosed ? "red" : undefined} />
            <Stat
              label="Resolved"
              value={findings.filter((f) => f.status !== "open").length}
            />
          </div>

          <CookieFindings
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            findings={findings.map((f) => ({
              id: f.id,
              scriptName: f.scriptName,
              vendor: f.vendor,
              page: f.page,
              disclosed: f.disclosed,
              status: f.status,
              suggestedCategory: f.suggestedCategory,
            }))}
          />

          <Card title="Test & preview">
            <TestSimulator />
          </Card>
        </div>
      )}
    </Shell>
  );
}

function TestSimulator() {
  return (
    <div>
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Simulate how the banner behaves under different conditions — one screen,
        a selector rather than three separate tools.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Pill tone="blue">Geo</Pill>
        <span className="cell-sub">Show the banner as a visitor from a chosen region would see it.</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <Pill tone="blue">Language</Pill>
        <span className="cell-sub">Render in an Eighth Schedule language.</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <Pill tone="blue">Reconsent on version change</Pill>
        <span className="cell-sub">Check that a policy version bump re-prompts existing visitors.</span>
      </div>
    </div>
  );
}
