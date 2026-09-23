"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, Scale, ShieldCheck, Check, X } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { proposeProtectionRuleAction, decideProtectionRuleAction } from "@/app/actions/ruleLibrary";
import { TIER_LABEL, TIER_TONE, TIER_BLURB, METHOD_LABEL, PII_CATEGORIES, METHODS, STRICTNESS } from "@/lib/ruleLibrary";
import type { ActionResult } from "@/app/actions/requests";

export interface TemplateCard {
  id: string; tier: string; name: string; piiCategory: string; defaultMethod: string;
  suggestedScope: string; strictness: string; definition: string; statutoryCitation: string | null;
}
export interface PendingRule {
  id: string; ruleName: string; dataCategory: string; ruleType: string; strictness: string;
  definition: string; tier: string | null; statutoryCitation: string | null; proposedBy: string | null; fromTemplate: boolean;
}

const RULETYPE_TO_METHOD: Record<string, string> = { mask: "masking", encrypt: "encryption", dlp: "tokenization" };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function RuleLibrary({ templates, pending, role }: { templates: TemplateCard[]; pending: PendingRule[]; role: string }) {
  const [composer, setComposer] = useState<{ template: TemplateCard | null } | null>(null);
  const byTier = (tier: string) => templates.filter((t) => t.tier === tier);
  const canApprove = role === "ciso" || role === "admin"; // admin allowed only when combined governance (enforced server-side)

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Pending CISO approval — every tier lands here, none skips it. */}
      {pending.length > 0 && <PendingApprovals pending={pending} canApprove={canApprove} />}

      <TierSection tier="baseline_pii" cards={byTier("baseline_pii")} onSelect={(t) => setComposer({ template: t })} />
      <TierSection tier="dpdp_specific" cards={byTier("dpdp_specific")} onSelect={(t) => setComposer({ template: t })} />

      <div>
        <div className="section-label" style={{ marginBottom: 6 }}>
          <span className="row" style={{ gap: 6 }}><Pill tone={TIER_TONE.custom} dot={false}>{TIER_LABEL.custom}</Pill></span>
        </div>
        <p className="cell-sub" style={{ margin: "0 0 10px" }}>{TIER_BLURB.custom}</p>
        <button className="btn primary sm" onClick={() => setComposer({ template: null })}><Plus size={14} /> Create custom rule</button>
      </div>

      <Notice tone="policy" title="A template pre-fills, it never pre-empts approval">
        Selecting a template only saves composition time. Every rule — Baseline PII, DPDP-Specific or Custom — is proposed here and still reviewed and approved by the CISO before it reaches Approved Policy or the implementation screen. There is no per-tier shortcut.
      </Notice>

      {composer && <RuleComposer template={composer.template} onClose={() => setComposer(null)} />}
    </div>
  );
}

function TierSection({ tier, cards, onSelect }: { tier: string; cards: TemplateCard[]; onSelect: (t: TemplateCard) => void }) {
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <Pill tone={TIER_TONE[tier]} dot={false}>{TIER_LABEL[tier]}</Pill>
        {tier === "dpdp_specific" && <Scale size={13} className="cell-sub" />}
      </div>
      <p className="cell-sub" style={{ margin: "0 0 10px" }}>{TIER_BLURB[tier]}</p>
      {cards.length === 0 ? (
        <p className="cell-sub">No templates in this tier.</p>
      ) : (
        <div className="card-grid">
          {cards.map((t) => (
            <button key={t.id} className="role-card" onClick={() => onSelect(t)} style={{ textAlign: "left" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                <span className="row" style={{ gap: 6 }}><Lock size={12} className="muted" /><span className="cell-primary">{t.name}</span></span>
                <Pill tone="gray" dot={false}>{t.piiCategory}</Pill>
              </div>
              <p className="cell-sub role-card-desc">{t.definition || "No description."}</p>
              <div className="stack" style={{ gap: 4, marginTop: "auto" }}>
                <span className="cell-sub">Method: <strong>{METHOD_LABEL[t.defaultMethod] ?? t.defaultMethod}</strong> · Scope: {t.suggestedScope}</span>
                {t.statutoryCitation && <span className="cell-sub" style={{ color: "var(--blue)" }}><Scale size={11} style={{ verticalAlign: "-1px" }} /> {t.statutoryCitation}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleComposer({ template, onClose }: { template: TemplateCard | null; onClose: () => void }) {
  const { pending, result, run } = useRun();
  const tier = template?.tier ?? "custom";
  const [ruleName, setRuleName] = useState(template?.name ?? "");
  const [dataCategory, setDataCategory] = useState(template?.piiCategory ?? "identity");
  const [method, setMethod] = useState(template?.defaultMethod ?? "masking");
  const [strictness, setStrictness] = useState(template?.strictness ?? "high");
  const [scope, setScope] = useState(template?.suggestedScope ?? "");
  const [definition, setDefinition] = useState(template?.definition ?? "");
  const [citation, setCitation] = useState(template?.statutoryCitation ?? "");

  const submit = () => run(
    () => proposeProtectionRuleAction({ ruleName, dataCategory, method, strictness, scope, definition, statutoryCitation: citation || null, sourceTemplateId: template?.id ?? null, tier }),
    onClose,
  );

  return (
    <Modal
      title={template ? `New rule from “${template.name}”` : "New custom protection rule"}
      subtitle={template ? "Pre-filled from the template — review and adjust, then submit for CISO approval." : "Compose from scratch — submit for CISO approval."}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending || !ruleName.trim() || !definition.trim()} onClick={submit}>{pending ? "Submitting…" : "Submit for CISO approval"}</button></>}
    >
      <ActionError result={result} />
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Pill tone={TIER_TONE[tier]} dot={false}>{TIER_LABEL[tier]}</Pill>
        {template && <Pill tone="gray" dot={false}>from template</Pill>}
      </div>
      <label className="fld"><span>Rule name</span><input className="input" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. PAN masking — customer-facing views" /></label>
      <label className="fld"><span>PII category</span>
        <select className="input" value={dataCategory} onChange={(e) => setDataCategory(e.target.value)}>{PII_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>
      <label className="fld"><span>Method</span>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select>
      </label>
      <label className="fld"><span>Strictness</span>
        <select className="input" value={strictness} onChange={(e) => setStrictness(e.target.value)}>{STRICTNESS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <label className="fld"><span>Suggested scope <span className="cell-sub">(Admin implements the exact systems later)</span></span><input className="input" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. All customer-facing systems" /></label>
      <label className="fld"><span>Definition</span><textarea className="input" rows={2} value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="What the rule does and why." /></label>
      <label className="fld"><span>Statutory citation <span className="cell-sub">{tier === "dpdp_specific" ? "(carried from the template)" : "(optional)"}</span></span><input className="input" value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="e.g. DPDP Act 2023, s.8(5)" /></label>
    </Modal>
  );
}

function PendingApprovals({ pending, canApprove }: { pending: PendingRule[]; canApprove: boolean }) {
  const { pending: busy, result, run } = useRun();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="card">
      <div className="card-head"><span className="row" style={{ gap: 6 }}><ShieldCheck size={14} /> Awaiting CISO approval ({pending.length})</span></div>
      <div className="card-body">
        <ActionError result={result} />
        {pending.map((r) => (
          <div key={r.id} className="pick-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="cell-stack" style={{ flex: 1, minWidth: 240 }}>
              <span className="cell-primary">{r.ruleName} {r.tier && <Pill tone={TIER_TONE[r.tier]} dot={false}>{TIER_LABEL[r.tier]}</Pill>} {r.fromTemplate ? <Pill tone="gray" dot={false}>from template</Pill> : <Pill tone="purple" dot={false}>custom</Pill>}</span>
              <span className="cell-sub">{r.dataCategory} · {RULETYPE_TO_METHOD[r.ruleType] ? METHOD_LABEL[RULETYPE_TO_METHOD[r.ruleType]] : r.ruleType} · {r.strictness} · proposed by {r.proposedBy ?? "—"}</span>
              <span className="cell-sub">{r.definition}</span>
              {r.statutoryCitation && <span className="cell-sub" style={{ color: "var(--blue)" }}>{r.statutoryCitation}</span>}
            </div>
            {canApprove ? (
              rejecting === r.id ? (
                <div className="row" style={{ gap: 6 }}>
                  <input className="input sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn danger sm" disabled={busy} onClick={() => run(() => decideProtectionRuleAction(r.id, false, reason), () => { setRejecting(null); setReason(""); })}>Confirm reject</button>
                  <button className="btn ghost sm" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm primary" disabled={busy} onClick={() => run(() => decideProtectionRuleAction(r.id, true, ""))}><Check size={12} /> Approve</button>
                  <button className="btn sm ghost" onClick={() => setRejecting(r.id)}><X size={12} /> Reject</button>
                </div>
              )
            ) : (
              <Pill tone="yellow" dot={false}>Awaiting CISO — switch to CISO to decide</Pill>
            )}
          </div>
        ))}
        <Link href="/data-flow/protection-rules" className="row-link" style={{ marginTop: 8, display: "inline-block" }}>Approved rules go to the implementation screen →</Link>
      </div>
    </div>
  );
}
