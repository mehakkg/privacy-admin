import Link from "next/link";
import { AlertTriangle, ArrowRight, History, Pencil } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, Notice, InfoTip } from "@/components/ui";
import { EnforcementBanner } from "@/components/masking/EnforcementBanner";
import { FieldPicker } from "@/components/masking/FieldPicker";
import { LockTreatment } from "@/components/masking/LockTreatment";
import { resolveEffective, listMaskingFields } from "@/lib/engines/masking";
import { tierBadge, TIER_TONE, METHOD_LABEL, type ResolutionStep, type EffectiveResolution } from "@/lib/masking";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 — Field Lookup & Resolution Chain (+ SCREEN 2 lock treatments inline).
 *
 * The 3-step resolution (tenant → regional → BASELINE) is made legible: a winning
 * rule with its reason, expandable into every step INCLUDING the ones that lost,
 * because a regulatory floor sitting under a tenant override must stay visible even
 * when it is not the active step. A genuine two-template collision is shown as a
 * hard error naming both sources, never as a quietly-picked value.
 */
export default async function MaskingFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const [fields, resolution] = await Promise.all([
    listMaskingFields(),
    code ? resolveEffective(code) : Promise.resolve(null),
  ]);

  return (
    <Shell active="/masking/fields" title="Dynamic Data Masking">
      <PageHead
        title="Masking field lookup"
        titleTip="Shows the masking a field actually gets and why — resolved across the templates this tenant is associated with, tenant rule over regional over the BASELINE floor. The same resolver backs GET /api/v1/admin/masking-rules/effective."
        subtitle="Look up any field to see its effective masking rule and the full precedence chain behind it."
      />
      <EnforcementBanner />

      <div className="split-2">
        <Card title="Fields">
          <FieldPicker
            fields={fields.map((f) => ({ code: f.code, name: f.name, custom: f.custom }))}
            selected={code?.toUpperCase() ?? null}
          />
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          {!resolution && (
            <Card>
              <div className="empty">Pick a field on the left to resolve its effective masking rule.</div>
            </Card>
          )}
          {resolution && resolution.status === "not_found" && (
            <Card title={resolution.code}>
              <Notice tone="info" title="No rule found">
                No template — tenant, regional, or BASELINE — defines a masking rule for{" "}
                <code>{resolution.code}</code>. Nothing is enforced for this code today.
              </Notice>
            </Card>
          )}
          {resolution && resolution.status !== "not_found" && <Resolution r={resolution} />}
        </div>
      </div>
    </Shell>
  );
}

function Resolution({ r }: { r: EffectiveResolution }) {
  return (
    <>
      {r.status === "ambiguous" ? (
        <Card>
          <div className="lock-box ambiguity">
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <AlertTriangle size={18} style={{ color: "var(--red)" }} />
              <span className="cell-primary">Ambiguous — this field does not resolve</span>
            </div>
            <p className="cell-sub" style={{ margin: "8px 0 0" }}>
              <code>{r.code}</code> is claimed by two non-BASELINE templates at the same precedence,
              so there is no single winner. Until one is removed or a tenant rule is added to break the
              tie, the field will fail to resolve at request time.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {r.ambiguity?.sources.map((s) => (
                <Pill key={s.ruleId} tone="red" dot={false}>{s.templateName}</Pill>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        r.winner && <WinnerCard r={r} winner={r.winner} />
      )}

      <Card title={<span className="row" style={{ gap: 6 }}>Resolution chain <InfoTip text="Every template that defines this code, in precedence order. Losing steps are kept visible — the BASELINE floor is never hidden just because something overrides it." /></span>}>
        <div className="stack" style={{ gap: 8 }}>
          {r.chain.map((s) => <ChainStep key={s.ruleId} s={s} />)}
        </div>
        <div className="row" style={{ gap: 14, marginTop: 12 }}>
          <Link href={`/masking/audit?search=${encodeURIComponent(r.code)}`} className="row-link">
            <History size={13} style={{ verticalAlign: "-2px" }} /> Config change history for this field
          </Link>
        </div>
      </Card>
    </>
  );
}

function WinnerCard({ r, winner }: { r: EffectiveResolution; winner: ResolutionStep }) {
  const [before, after] = winner.maskExample.includes(" → ") ? winner.maskExample.split(" → ") : [r.sampleValue, winner.maskExample];
  return (
    <Card
      title={<span className="row" style={{ gap: 8 }}>{r.fieldName} <span className="cell-sub mono">{r.code}</span></span>}
      actions={<Pill tone={TIER_TONE[winner.tier]} dot={false}>{tierBadge(winner.tier, winner.templateName)}</Pill>}
    >
      <div className="mask-preview">
        <code className="mask-before">{before}</code>
        <ArrowRight size={16} className="muted" />
        <code className="mask-after">{after}</code>
      </div>
      <p className="cell-sub" style={{ margin: "10px 0 0" }}>
        <strong>{METHOD_LABEL[winner.method] ?? winner.method}</strong> — {winner.reason}
      </p>

      <div style={{ marginTop: 14 }}>
        <LockTreatment
          ruleId={winner.ruleId}
          lockType={winner.lockType}
          regulated={winner.regulated}
          editable={winner.editable}
          lockedBy={winner.lockedBy}
          lockedAt={winner.lockedAt}
          statutoryCitation={winner.statutoryCitation}
        />
      </div>

      {r.editableRuleId && (
        <div className="row" style={{ marginTop: 12 }}>
          <Link href={`/masking/rules/${r.editableRuleId}/edit`} className="btn primary sm">
            <Pencil size={13} /> Edit this rule
          </Link>
        </div>
      )}
    </Card>
  );
}

function ChainStep({ s }: { s: ResolutionStep }) {
  return (
    <div className={`chain-step${s.won ? " won" : " lost"}`}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pill tone={s.won ? TIER_TONE[s.tier] : "gray"} dot={false}>{tierBadge(s.tier, s.templateName)}</Pill>
        {s.won ? <Pill tone="green" dot={false}>winner</Pill> : <span className="cell-sub">overridden</span>}
        <span className="cell-sub mono" style={{ marginLeft: "auto" }}>{s.maskExample}</span>
      </div>
      <p className="cell-sub" style={{ margin: "6px 0 0" }}>
        <strong>{METHOD_LABEL[s.method] ?? s.method}</strong> · precedence {s.precedence} — {s.reason}
      </p>
      {s.statutoryCitation && (
        <p className="cell-sub" style={{ margin: "3px 0 0", color: "var(--blue)" }}>{s.statutoryCitation}</p>
      )}
    </div>
  );
}
