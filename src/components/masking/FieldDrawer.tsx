"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Lock, LockOpen, ShieldCheck, Pencil, GitPullRequest, Check, Ban, Clock, ExternalLink, AlertTriangle, LayoutTemplate, RotateCcw, Unlink, RefreshCw, History, ToggleLeft, ToggleRight, Trash2, Copy, FolderInput, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { CreateRuleModal, type CatalogField } from "@/components/masking/CreateRuleModal";
import { RuleEditor, defaultParamsFor } from "@/components/masking/RuleEditor";
import {
  ruleLabel, runMaskCore, SENSITIVITY_TONE, EXCEPTION_ROLES,
  type Rule, type FieldResolution, type RulePatch, type RuleVersion,
} from "@/lib/masking";
import {
  decideChangeAction, withdrawProposalAction, counterProposeAction, unlockSelfLockedAction, templateFieldsAction,
  detachFieldAction, resyncFieldToGroupAction,
  setOverrideOffAction, proposeOverrideOnAction, deleteRuleAction, ruleVersionsAction,
  proposeVariantAction, removeVariantAction, moveRuleToTemplateAction,
  type MaskingActionResult,
} from "@/app/actions/masking";
import type { TemplateFieldRow, CustomTemplateView } from "@/lib/engines/masking";

export interface PendingView {
  id: string; kind: string; proposedBy: string; proposedAt: string; reason: string;
  before: RulePatch[]; after: RulePatch[];
}
export interface HistoryRow { seq: number; action: string; actor: string; at: string }

const GOVERNED_TONE: Record<string, PillTone> = { baseline: "red", regional: "gray", tenant: "purple" };

function useRun() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const run = async (op: () => Promise<MaskingActionResult>, after?: () => void) => {
    setPending(true);
    const r = await op();
    setResult(r);
    setPending(false);
    if (r.ok) { after?.(); router.refresh(); }
  };
  return { pending, result, run, setResult };
}

export function FieldDrawer({
  res, pending, history, role, closeHref, groupId, groupName, diverged, customTemplates, fullCatalog, autoDo,
}: {
  res: FieldResolution;
  pending: PendingView | null;
  history: HistoryRow[];
  role: string;
  closeHref: string;
  groupId: string | null;
  groupName: string | null;
  diverged: boolean;
  customTemplates: CustomTemplateView[];
  fullCatalog: CatalogField[];
  autoDo: string | null;
}) {
  const router = useRouter();
  const gov = res.governedBy;
  const treatment = gov?.treatment ?? null;
  const isDpo = role === "dpo";
  const close = () => router.push(closeHref);
  const unlock = useRun();
  const mutate = useRun();

  // state = no_rule | regulatory_floor | template_governed | tenant_governed.
  const state = res.status === "ambiguous" ? "ambiguous"
    : !res.hasRule ? "no_rule"
    : treatment === "system" ? "regulatory_floor"
    : treatment === "governed" ? "template_governed"
    : treatment === "self" ? "self_locked"
    : "tenant_governed";

  // The drawer's Create/Override/Edit/Duplicate reuse the SAME stepper.
  const [stepper, setStepper] = useState<null | { kind: "create" | "override" | "edit" | "duplicate" }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveKey, setMoveKey] = useState("");
  const [onReason, setOnReason] = useState("");
  const [versions, setVersions] = useState<RuleVersion[] | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState<RuleVersion | null>(null);
  const overrideOff = res.overrideOff;
  const loadVersions = () => { setRestoreOpen((o) => !o); if (versions === null) ruleVersionsAction(res.code).then(({ versions }) => setVersions(versions)); };
  const selfCatalog: CatalogField[] = [{ code: res.code, name: res.name, sensitivity: res.sensitivity, source: gov?.badge ?? "No rule", systemRegulated: !!gov?.systemRegulated, sampleValue: res.sampleValue }];
  const catalog = selfCatalog;
  const currentRule: Rule | undefined = res.effective ? { family: res.effective.family, params: res.effective.params } : undefined;
  const templateKey = gov ? (gov.layer === "baseline" ? "BASELINE" : gov.layer === "regional" ? gov.source : null) : null;
  const [tpl, setTpl] = useState<{ key: string; rows: TemplateFieldRow[] } | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const openTemplate = () => {
    if (!templateKey) return;
    if (tpl?.key === templateKey) { setTpl(null); return; }
    setTplLoading(true);
    templateFieldsAction(templateKey).then(({ fields }) => { setTpl({ key: templateKey, rows: fields }); setTplLoading(false); });
  };

  // Auto-open the action the ⋯ menu asked for (via ?do=), once on mount.
  useEffect(() => {
    if (!autoDo || pending) return;
    if (autoDo === "create" || autoDo === "edit" || autoDo === "override" || autoDo === "duplicate") setStepper({ kind: autoDo as "create" | "edit" | "override" | "duplicate" });
    else if (autoDo === "template") openTemplate();
    else if (autoDo === "restore") loadVersions();
    else if (autoDo === "move") setMoveOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mask-drawer-scrim" onClick={close} />
      <aside className="mask-drawer" role="dialog" aria-label={`${res.code} masking`}>
        <div className="mask-drawer-head">
          <div className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="cell-primary mono">{res.code}</span>
              <Pill tone={SENSITIVITY_TONE[res.sensitivity]} dot={false}>{res.sensitivity}</Pill>
              {res.status === "ambiguous" && <Pill tone="red" dot={false}>Ambiguous</Pill>}
              {gov && <Pill tone={pending ? "yellow" : GOVERNED_TONE[gov.layer]} dot={false}>{pending ? `${gov.badge} · change pending` : gov.badge}{gov.stricter ? " · stricter" : ""}</Pill>}
              {!gov && res.status !== "ambiguous" && <Pill tone="red" dot={false}>No rule</Pill>}
            </div>
            <span className="cell-sub">{res.name}</span>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Header actions — computed per state, never a fixed set. */}
        <div className="mask-drawer-actionbar">
          {(mutate.result && !mutate.result.ok) && <div className="notice danger" style={{ marginBottom: 8 }}><div className="notice-title">Refused — {mutate.result.errorKind}</div><div>{mutate.result.error}</div></div>}

          {/* While a proposal is pending, mutating actions are suppressed everywhere. */}
          {pending ? (
            <span className="row cell-sub" style={{ gap: 6, color: "var(--yellow)" }}><Clock size={13} /> A change is pending — see the diff below.</span>
          ) : (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {state === "no_rule" && (
                <button className="btn sm primary" onClick={() => setStepper({ kind: "create" })}><Pencil size={13} /> Create rule</button>
              )}
              {state === "regulatory_floor" && (
                <span className="row cell-sub" style={{ gap: 6, color: "var(--red)" }}><ShieldCheck size={13} /> This field is owned by the platform. No tenant, including yours, can ever change it.</span>
              )}
              {state === "template_governed" && !overrideOff && (
                <button className="btn sm primary" onClick={() => setStepper({ kind: "override" })}><GitPullRequest size={13} /> Override</button>
              )}
              {state === "self_locked" && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="row cell-sub" style={{ gap: 6, color: "var(--yellow)" }}><Lock size={13} /> Locked by your team. You can unlock this anytime.</span>
                  {unlock.result && !unlock.result.ok && <span className="cell-sub" style={{ color: "var(--red)" }}>{unlock.result.error}</span>}
                  <button className="btn sm" disabled={unlock.pending} onClick={() => unlock.run(() => unlockSelfLockedAction(res.code))}><LockOpen size={13} /> {unlock.pending ? "Unlocking…" : "Unlock"}</button>
                </div>
              )}
              {/* Override switched Off: stored rule retained, resolution falls through live. */}
              {overrideOff && res.storedRule && (
                <div className="stack" style={{ gap: 6, width: "100%" }}>
                  <span className="row cell-sub" style={{ gap: 6, color: "var(--yellow)" }}><ToggleLeft size={15} /> Override is <strong>Off</strong> — resolving live to <span className="mono">{res.effective?.preview.split(" → ")[1] ?? "the template value"}</span>. Your stored rule (<span className="mono">{res.storedRule.label}</span>) is kept but inactive.</span>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <input className="input sm" style={{ flex: "1 1 180px" }} placeholder="Reason to turn back On (needs approval)" value={onReason} onChange={(e) => setOnReason(e.target.value)} />
                    <button className="btn sm primary" disabled={mutate.pending} onClick={() => mutate.run(() => proposeOverrideOnAction(res.code, onReason))}><ToggleRight size={13} /> Turn On (needs approval)</button>
                  </div>
                  {!confirmDelete ? (
                    <button className="btn sm danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete stored rule</button>
                  ) : (
                    <span className="row" style={{ gap: 6 }}><span className="cell-sub">Delete the stored rule for good?</span><button className="btn sm danger" disabled={mutate.pending} onClick={() => mutate.run(() => deleteRuleAction(res.code), () => setConfirmDelete(false))}>Delete</button><button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Cancel</button></span>
                  )}
                </div>
              )}

              {state === "tenant_governed" && !overrideOff && (
                <>
                  <button className="btn sm primary" onClick={() => setStepper({ kind: "edit" })}><Pencil size={13} /> Edit</button>
                  {/* Override Off — unilateral (the one safe direction), keeps the value. */}
                  <button className="btn sm" disabled={mutate.pending} onClick={() => mutate.run(() => setOverrideOffAction(res.code))}><ToggleLeft size={13} /> Override: On → Off</button>
                  {/* Manual history-based revert — distinct from the Off toggle. */}
                  <button className="btn sm" onClick={loadVersions}><RotateCcw size={13} /> Restore earlier version</button>
                  <button className="btn sm" onClick={() => setStepper({ kind: "duplicate" })}><Copy size={13} /> Duplicate</button>
                  {customTemplates.length > 0 && <button className="btn sm" onClick={() => setMoveOpen((o) => !o)}><FolderInput size={13} /> Move to template</button>}
                  {!confirmDelete ? (
                    <button className="btn sm danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</button>
                  ) : (
                    <span className="row" style={{ gap: 6, width: "100%" }}><span className="cell-sub">Delete this rule entirely? This removes it and its channel/role views.</span><button className="btn sm danger" disabled={mutate.pending} onClick={() => mutate.run(() => deleteRuleAction(res.code), () => setConfirmDelete(false))}>Delete rule</button><button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Cancel</button></span>
                  )}
                  {groupId && diverged && (
                    <>
                      <span className="row cell-sub" style={{ gap: 6, width: "100%", color: "var(--yellow)" }}><RefreshCw size={12} /> Diverged from group “{groupName}”.</span>
                      <button className="btn sm" disabled={mutate.pending} onClick={() => mutate.run(() => detachFieldAction(groupId, res.code))}><Unlink size={13} /> Detach from group</button>
                      <button className="btn sm" disabled={mutate.pending} onClick={() => mutate.run(() => resyncFieldToGroupAction(groupId, res.code))}><RefreshCw size={13} /> Re-sync to group definition</button>
                    </>
                  )}
                  {/* Restore earlier version — a prior stored value, re-entered via Edit (routes to approval). */}
                  {restoreOpen && (
                    <div className="stack" style={{ gap: 4, width: "100%", border: "1px solid var(--border-soft)", borderRadius: 8, padding: 8 }}>
                      <span className="cell-sub">Earlier values from this rule’s history — restoring re-enters one and goes to the DPO for approval.</span>
                      {versions === null ? <span className="cell-sub">Loading…</span>
                        : versions.length === 0 ? <span className="cell-sub">No earlier versions recorded.</span>
                        : versions.map((v, i) => (
                          <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                            <span className="cell-sub"><span className="mono">{v.label}</span> · {v.by} · {v.at}</span>
                            <button className="btn ghost sm" onClick={() => { setStepper({ kind: "edit" }); setRestoreVersion(v); }}>Restore</button>
                          </div>
                        ))}
                    </div>
                  )}
                  {/* Move to template — a TRUE re-association (same rule, history continues). */}
                  {moveOpen && (
                    <div className="row" style={{ gap: 6, width: "100%", flexWrap: "wrap" }}>
                      <select className="input sm" value={moveKey} onChange={(e) => setMoveKey(e.target.value)}>
                        <option value="">Choose a custom template…</option>
                        {customTemplates.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.fields})</option>)}
                      </select>
                      <button className="btn sm primary" disabled={!moveKey || mutate.pending} onClick={() => mutate.run(() => moveRuleToTemplateAction(res.code, moveKey), () => setMoveOpen(false))}>Move</button>
                      <span className="cell-sub">Same rule, same audit history — only its template changes.</span>
                    </div>
                  )}
                </>
              )}
              <Link href={`/audit?module=masking&field=${res.code}`} className="btn ghost sm"><History size={13} /> View history</Link>
            </div>
          )}
        </div>

        <div className="mask-drawer-body">
          {(
            <>
              {/* Ambiguity — a hard error naming both sources, never a chosen winner. */}
              {res.status === "ambiguous" && (
                <Section title="Resolver error">
                  <div className="lock-box" style={{ background: "var(--red-bg)", borderColor: "var(--red-border)" }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}><AlertTriangle size={16} style={{ color: "var(--red)" }} /><strong>Ambiguous — this field does not resolve</strong></div>
                    <p className="cell-sub" style={{ margin: "8px 0 0" }}>
                      <code>{res.code}</code> is claimed by two non-BASELINE templates at the same precedence, so there is no single winner. One must be removed, or a tenant rule added, before it resolves.
                    </p>
                    <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {res.ambiguity?.sources.map((s) => <Pill key={s} tone="red" dot={false}>{s}</Pill>)}
                    </div>
                  </div>
                </Section>
              )}
              {/* Effective rule */}
              {res.status !== "ambiguous" && <Section title="Effective rule">
                {res.effective ? (
                  <>
                    <div className="mask-preview sm"><code className="mask-before">{res.sampleValue}</code><span className="muted">→</span><code className="mask-after">{res.effective.preview.split(" → ")[1] ?? res.effective.preview}</code></div>
                    <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <strong>{res.effective.label}</strong>
                      <Pill tone={res.effective.reversible ? "blue" : "gray"} dot={false}>{res.effective.reversible ? "reversible" : "irreversible"}</Pill>
                    </div>
                    {/* Plain-language governance explanation. */}
                    {state === "template_governed" && gov && (
                      <p className="cell-sub" style={{ marginTop: 8 }}>
                        This field is governed by the <strong>{gov.badge}</strong>{gov.layer === "regional" ? ", which takes precedence over the BASELINE default" : " default"}. Right now it shows as <span className="mono">{res.effective.preview.split(" → ")[1] ?? res.effective.preview}</span>. Overriding it is a governance decision, so any change goes to the DPO for approval.
                      </p>
                    )}
                    {state === "tenant_governed" && gov && (
                      <p className="cell-sub" style={{ marginTop: 8 }}>
                        This field uses your tenant&rsquo;s own rule{gov.stricter ? ", stricter than the template beneath it" : ""}. Editing it goes to the DPO for approval; reverting to the template default is immediate.
                      </p>
                    )}
                    {res.citation && <p className="cell-sub" style={{ marginTop: 6, color: "var(--blue)" }}>{res.citation}</p>}
                  </>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    <span className="row cell-sub" style={{ gap: 6, color: "var(--red)" }}><Ban size={14} /> No rule applied. This field is not masked anywhere.</span>
                    <button className="btn sm primary" onClick={() => setStepper({ kind: "create" })} style={{ alignSelf: "flex-start" }}><Pencil size={13} /> Create rule</button>
                  </div>
                )}
              </Section>}

              {/* Resolution chain */}
              {res.chain.length > 0 && (
                <Section title="Resolution chain">
                  <div className="stack" style={{ gap: 6 }}>
                    {res.chain.map((c) => (
                      <div key={`${c.layer}-${c.source ?? ""}`} className={`chain-step ${c.won ? "won" : "lost"}`}>
                        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {c.layer === "baseline" && <Lock size={12} className="muted" />}
                          <Pill tone={c.won ? GOVERNED_TONE[c.layer] : "gray"} dot={false}>{c.layer === "regional" ? `${c.source} template` : c.layer === "baseline" ? "Baseline" : "Tenant"}</Pill>
                          <span className={c.won ? "cell-primary" : "cell-sub"} style={c.won ? {} : { textDecoration: "line-through" }}>{c.label}</span>
                          {c.won && <Pill tone="green" dot={false}>winner</Pill>}
                        </div>
                        {c.layer === "baseline" && <p className="cell-sub" style={{ margin: "4px 0 0" }}>floor · tenant can only tighten</p>}
                        {c.citation && <p className="cell-sub" style={{ margin: "4px 0 0", color: "var(--blue)" }}>{c.citation}</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Rule by channel — collapsed to a one-liner when no channel overrides exist. */}
              {res.channels.length > 0 && (
                <Section title="Rule by channel" collapsible defaultOpen={res.overrideCount > 0} summary={res.overrideCount > 0 ? `${res.overrideCount} override${res.overrideCount === 1 ? "" : "s"}` : "Same on all channels"}>
                  <div className="table-wrap">
                    <table className="dtable compact">
                      <thead><tr><th>Channel</th><th>Rule</th><th>Preview</th><th>Source</th></tr></thead>
                      <tbody>
                        {res.channels.map((c) => (
                          <tr key={c.channel}>
                            <td>{c.channelLabel} {c.isOverride && <Pill tone="blue" dot={false}>override</Pill>}</td>
                            <td className="cell-sub">{c.label}</td>
                            <td className="mono cell-sub">{c.preview.split(" → ")[1] ?? c.preview}</td>
                            <td className="cell-sub">{c.sourceLayer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* View template — Library's only remaining surface, nested here. */}
              {templateKey && res.status !== "ambiguous" && (
                <Section title="Template">
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="row cell-sub" style={{ gap: 6 }}><LayoutTemplate size={13} /> Governed by the {gov?.badge}.</span>
                    <button className="link-btn" onClick={openTemplate}>{tpl?.key === templateKey ? "Hide template" : "View template"}</button>
                  </div>
                  {tplLoading && <p className="cell-sub" style={{ marginTop: 8 }}>Loading…</p>}
                  {tpl?.key === templateKey && (
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table className="dtable compact"><thead><tr><th>Field</th><th>Rule</th><th>Preview</th></tr></thead>
                        <tbody>
                          {tpl.rows.map((t) => (
                            <tr key={t.code}><td className="mono">{t.code}</td><td className="cell-sub">{t.label}</td><td className="mono cell-sub">{t.preview.split(" → ")[1] ?? t.preview}</td></tr>
                          ))}
                          {tpl.rows.length === 0 && <tr><td colSpan={3}><span className="cell-sub">No fields in this template.</span></td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              )}

              {/* Visibility Matrix (role/channel) — only for governed/tenant fields,
                  structurally ABSENT for regulatory_floor and ambiguous. Gated. */}
              {(state === "template_governed" || state === "tenant_governed") && res.status !== "ambiguous" && (
                <Section title="Who sees what (role & channel views)" collapsible defaultOpen={res.variants.length > 0} summary={res.variants.length > 0 ? `${res.variants.length} view${res.variants.length === 1 ? "" : "s"} · resolves to Default` : "Default only · not enforced yet"}>
                  <VisibilityMatrix res={res} canEdit={!pending} />
                </Section>
              )}

              {/* Pending change */}
              {pending && (
                <Section title="Pending change">
                  <PendingBlock pending={pending} isDpo={isDpo} sampleValue={res.sampleValue} />
                </Section>
              )}

              {/* History */}
              <Section title="History" collapsible defaultOpen={false} summary={history.length === 0 ? "None" : `${history.length} recent`}>
                {history.length === 0 ? <p className="cell-sub">No changes recorded.</p> : (
                  <div className="stack" style={{ gap: 4 }}>
                    {history.map((h) => (
                      <div key={h.seq} className="row cell-sub" style={{ gap: 6, justifyContent: "space-between" }}>
                        <span>#{h.seq} {h.action.replace("masking.", "")} · {h.actor}</span>
                        <span className="mono">{h.at}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Link href={`/audit?module=masking&field=${res.code}`} className="row-link" style={{ marginTop: 8, display: "inline-flex", gap: 4 }}>
                  See full log <ExternalLink size={12} />
                </Link>
              </Section>
            </>
          )}
        </div>
      </aside>

      {stepper && stepper.kind === "duplicate" && (
        <CreateRuleModal
          catalog={fullCatalog.filter((f) => f.code !== res.code)}
          initialSelected={[]}
          startStep={0}
          initialRule={currentRule}
          heading={`Duplicate ${res.code}’s rule to another field`}
          onClose={() => setStepper(null)}
        />
      )}
      {stepper && stepper.kind !== "duplicate" && (
        <CreateRuleModal
          catalog={catalog}
          initialSelected={[res.code]}
          lockedField={res.code}
          startStep={stepper.kind === "edit" ? 1 : 0}
          initialRule={stepper.kind === "edit" ? (restoreVersion ? { family: restoreVersion.family, params: restoreVersion.params } : currentRule) : undefined}
          heading={stepper.kind === "create" ? "Create rule" : stepper.kind === "override" ? "Override rule" : restoreVersion ? `Restore an earlier version of ${res.code}` : "Edit rule"}
          onClose={() => { setStepper(null); setRestoreVersion(null); }}
        />
      )}
    </>
  );
}

/**
 * VISIBILITY MATRIX — role/channel variants. Built in full, but GATED: the
 * persistent notice is non-dismissible, and because ENFORCEMENT_ACTIVE is false
 * every request (and every preview) resolves to Default regardless of any variant
 * here. Adding a view is always a DPO proposal; the Default row is permanent.
 */
function VisibilityMatrix({ res, canEdit }: { res: FieldResolution; canEdit: boolean }) {
  const { pending: busy, result, run } = useRun();
  const [adding, setAdding] = useState<null | "role" | "channel">(null);
  const [scopeValue, setScopeValue] = useState("");
  const [reason, setReason] = useState("");
  const [rule, setRule] = useState<Rule>({ family: "full", params: defaultParamsFor("full") });
  const def = res.effective;
  const start = (t: "role" | "channel") => { setAdding(t); setScopeValue(""); setRule({ family: "full", params: defaultParamsFor("full") }); };
  const preview = (r: Rule) => runMaskCore(r, res.sampleValue) || "(removed)";

  return (
    <div className="stack" style={{ gap: 10 }}>
      <ActionError result={result} />
      {/* Persistent, non-dismissible gate notice. */}
      <div className="notice warn" style={{ margin: 0 }}>
        <div className="row" style={{ gap: 6 }}><AlertTriangle size={13} style={{ color: "var(--yellow)" }} /><strong>Role and channel enforcement is not yet active.</strong></div>
        <div className="cell-sub" style={{ marginTop: 2 }}>Until it is, every request resolves to the <strong>Default</strong> view regardless of these settings — so a view added here is stored and governed, but does not change what anyone sees yet.</div>
      </div>

      <div className="table-wrap"><table className="dtable compact">
        <thead><tr><th>View</th><th>Rule</th><th>Preview</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Default</strong> <span className="cell-sub">(applies when no more specific view matches)</span></td>
            <td className="cell-sub">{def?.label ?? "—"}</td>
            <td className="mono cell-sub">{def ? (def.preview.split(" → ")[1] ?? def.preview) : "—"}</td>
            <td></td>
          </tr>
          {res.variants.map((v) => (
            <tr key={v.id}>
              <td>{v.scopeType === "role" ? <Users size={12} className="muted" /> : null} {v.scopeValue} <Pill tone={v.status === "approved" ? "gray" : "yellow"} dot={false}>{v.status}</Pill></td>
              <td className="cell-sub">{v.label}</td>
              <td className="mono cell-sub">{v.preview.split(" → ")[1] ?? v.preview} <span className="cell-sub" style={{ color: "var(--yellow)" }}>· not live</span></td>
              <td>{canEdit && v.status === "approved" && <button className="btn ghost sm" disabled={busy} onClick={() => run(() => removeVariantAction(v.id))}><X size={12} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {canEdit && (adding ? (
        <div className="stack" style={{ gap: 8, border: "1px solid var(--border-soft)", borderRadius: 8, padding: 10 }}>
          <strong className="cell-primary">Add a {adding}-specific view</strong>
          {adding === "role" ? (
            <label className="fld"><span>Role</span>
              <select className="input sm" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">Choose a role…</option>
                {EXCEPTION_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          ) : (
            <label className="fld"><span>Channel</span>
              <input className="input sm" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="Name the channel (no fixed taxonomy yet)" />
            </label>
          )}
          <RuleEditor value={rule} onChange={setRule} floor={null} floorName={null} channel={null} sampleValue={res.sampleValue} />
          {/* Side-by-side: Default vs the new view, so the difference is visible before submitting. */}
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="cell-sub">Default: <span className="mono">{def ? (def.preview.split(" → ")[1] ?? def.preview) : "—"}</span></div>
            <span className="muted">vs</span>
            <div className="cell-sub">This view: <span className="mono">{preview(rule)}</span></div>
          </div>
          <input className="input sm" placeholder="Reason (goes to the DPO)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary sm" disabled={busy || !scopeValue.trim()} onClick={() => run(() => proposeVariantAction(res.code, adding, scopeValue.trim(), rule.family, rule.params, reason), () => setAdding(null))}>Submit for approval</button>
            <button className="btn ghost sm" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => start("role")}><Users size={13} /> Add role-specific view</button>
          <button className="btn sm" onClick={() => start("channel")}>Add channel-specific view</button>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children, collapsible, defaultOpen = true, summary }: { title: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean; summary?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <section className="mask-drawer-section">
        <h3 className="mask-section-title">{title}</h3>
        {children}
      </section>
    );
  }
  return (
    <section className="mask-drawer-section">
      <button className="mask-section-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="mask-section-title" style={{ margin: 0 }}>{title}</span>
        {!open && summary && <span className="cell-sub" style={{ marginLeft: "auto" }}>{summary}</span>}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

function ActionError({ result }: { result: MaskingActionResult | null }) {
  if (!result || result.ok) return null;
  return <div className="notice danger" style={{ marginBottom: 10 }}><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>;
}


function PendingBlock({ pending, isDpo, sampleValue }: { pending: PendingView; isDpo: boolean; sampleValue: string }) {
  const { pending: busy, result, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [countering, setCountering] = useState(false);
  const [note, setNote] = useState("");
  const [counterRule, setCounterRule] = useState<Rule>({ family: "partial", params: defaultParamsFor("partial") });
  const beforeLabel = pending.kind === "exception_add" ? "No exception" : pending.before.map((p) => `${p.channel ?? "default"}: ${ruleLabel(p as Rule)}`).join(", ");
  const afterLabel = pending.kind === "exception_add"
    ? `${pending.after[0]?.params.role}: ${pending.after[0]?.params.purpose} (${pending.after[0]?.params.durationMinutes} min)`
    : pending.after.map((p) => `${p.channel ?? "default"}: ${ruleLabel(p as Rule)}`).join(", ");

  return (
    <div className="lock-box" style={{ background: "var(--yellow-bg)", borderColor: "var(--yellow-border)" }}>
      <ActionError result={result} />
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Clock size={14} style={{ color: "var(--yellow)" }} />
        <span className="cell-sub" style={{ textDecoration: "line-through" }}>{beforeLabel}</span>
        <span className="muted">→</span>
        <strong>{afterLabel}</strong>
      </div>
      <p className="cell-sub" style={{ margin: "8px 0 0" }}>{pending.reason}</p>
      <p className="cell-sub" style={{ margin: "2px 0 0" }}>Proposed by {pending.proposedBy} · {pending.proposedAt}</p>

      {isDpo ? (
        rejecting ? (
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            <input className="input sm" placeholder="Reason for rejection (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn danger sm" disabled={busy || !note.trim()} onClick={() => run(() => decideChangeAction(pending.id, false, note))}>Confirm reject</button>
              <button className="btn ghost sm" onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        ) : countering ? (
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            <div className="cell-sub">Propose a different rule instead:</div>
            <RuleEditor value={counterRule} onChange={setCounterRule} floor={null} floorName={null} channel={null} sampleValue={sampleValue} />
            <input className="input sm" placeholder="Note for the counter (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={busy || !note.trim()} onClick={() => run(() => counterProposeAction(pending.id, counterRule.family, counterRule.params, note))}>Submit counter</button>
              <button className="btn ghost sm" onClick={() => setCountering(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn primary sm" disabled={busy} onClick={() => run(() => decideChangeAction(pending.id, true, ""))}><Check size={12} /> Approve</button>
            <button className="btn ghost sm" onClick={() => setRejecting(true)}><Ban size={12} /> Reject</button>
            <button className="btn ghost sm" onClick={() => setCountering(true)}><GitPullRequest size={12} /> Counter-propose</button>
          </div>
        )
      ) : (
        <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
          <Pill tone="yellow" dot={false}>Awaiting Kavita Menon (DPO)</Pill>
          <button className="btn ghost sm" disabled={busy} onClick={() => run(() => withdrawProposalAction(pending.id))}>Withdraw proposal</button>
        </div>
      )}
    </div>
  );
}
