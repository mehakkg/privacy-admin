"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Lock, Pencil, GitPullRequest, Check, Ban, Clock, ExternalLink } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { RuleEditor } from "@/components/masking/RuleEditor";
import {
  EXCEPTION_ROLES, ruleLabel, SENSITIVITY_TONE,
  type Rule, type FieldResolution, type RulePatch,
} from "@/lib/masking";
import {
  editTenantRuleAction, proposeChangeAction, proposeExceptionAction,
  decideChangeAction, withdrawProposalAction, type MaskingActionResult,
} from "@/app/actions/masking";

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
  res, pending, history, role, closeHref, floor, floorName,
}: {
  res: FieldResolution;
  pending: PendingView | null;
  history: HistoryRow[];
  role: string;
  closeHref: string;
  floor: Rule | null;
  floorName: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "propose" | "exception">("view");
  const gov = res.governedBy;
  const isTenant = gov?.layer === "tenant";
  const isBaseline = gov?.layer === "baseline";
  const isRegional = gov?.layer === "regional";
  const isDpo = role === "dpo";
  const close = () => router.push(closeHref);

  return (
    <>
      <div className="mask-drawer-scrim" onClick={close} />
      <aside className="mask-drawer" role="dialog" aria-label={`${res.code} masking`}>
        <div className="mask-drawer-head">
          <div className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="cell-primary mono">{res.code}</span>
              <Pill tone={SENSITIVITY_TONE[res.sensitivity]} dot={false}>{res.sensitivity}</Pill>
              {gov && <Pill tone={pending ? "yellow" : GOVERNED_TONE[gov.layer]} dot={false}>{pending ? `${gov.badge} · change pending` : gov.badge}{gov.stricter ? " · stricter" : ""}</Pill>}
              {!gov && <Pill tone="red" dot={false}>No rule</Pill>}
            </div>
            <span className="cell-sub">{res.name}</span>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Header action, governance-dependent */}
        <div className="mask-drawer-actionbar">
          {isBaseline && (
            <span className="row cell-sub" style={{ gap: 6, color: "var(--red)" }}>
              <Lock size={13} /> System-regulated. Owned by SUPER_ADMIN. No tenant can edit, override, or unlock this.
            </span>
          )}
          {isTenant && !pending && mode === "view" && (
            <button className="btn sm primary" onClick={() => setMode("edit")}><Pencil size={13} /> Edit rule</button>
          )}
          {isRegional && !pending && mode === "view" && (
            <button className="btn sm primary" onClick={() => setMode("propose")}><GitPullRequest size={13} /> Propose change</button>
          )}
          {!res.hasRule && (
            <button className="btn sm primary" onClick={() => setMode("edit")}><Pencil size={13} /> Add rule</button>
          )}
        </div>

        <div className="mask-drawer-body">
          {mode === "edit" && <EditForm res={res} floor={floor} floorName={floorName} onDone={() => setMode("view")} onNeedsApproval={() => setMode("propose")} />}
          {mode === "propose" && <ProposeForm res={res} floor={floor} floorName={floorName} onDone={() => setMode("view")} />}
          {mode === "exception" && <ExceptionForm res={res} onDone={() => setMode("view")} />}

          {mode === "view" && (
            <>
              {/* Effective rule */}
              <Section title="Effective rule">
                {res.effective ? (
                  <>
                    <div className="mask-preview sm"><code className="mask-before">{res.sampleValue}</code><span className="muted">→</span><code className="mask-after">{res.effective.preview.split(" → ")[1] ?? res.effective.preview}</code></div>
                    <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <strong>{res.effective.label}</strong>
                      <Pill tone={res.effective.reversible ? "blue" : "gray"} dot={false}>{res.effective.reversible ? "reversible" : "irreversible"}</Pill>
                    </div>
                    {res.citation && <p className="cell-sub" style={{ marginTop: 6, color: "var(--blue)" }}>{res.citation}</p>}
                  </>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    <span className="row cell-sub" style={{ gap: 6, color: "var(--red)" }}><Ban size={14} /> No rule applied. This field is not masked anywhere.</span>
                    <button className="btn sm primary" onClick={() => setMode("edit")} style={{ alignSelf: "flex-start" }}><Pencil size={13} /> Add rule</button>
                  </div>
                )}
              </Section>

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

              {/* Rule by channel */}
              {res.channels.length > 0 && (
                <Section title="Rule by channel">
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

              {/* Unmask exceptions */}
              <Section title="Unmask exceptions">
                {res.exceptions.length === 0 ? (
                  <p className="cell-sub">No one can see this field unmasked.</p>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    {res.exceptions.map((e) => (
                      <div key={e.id} className="row cell-sub" style={{ gap: 6, flexWrap: "wrap" }}>
                        <Pill tone="yellow" dot={false}>{e.role}</Pill>
                        purpose: {e.purpose} · {e.durationMinutes} min · logged{e.approvedBy ? ` · approved by ${e.approvedBy}` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {!isBaseline && <button className="link-btn" style={{ marginTop: 8 }} onClick={() => setMode("exception")}>+ Add exception (creates a proposal)</button>}
              </Section>

              {/* Pending change */}
              {pending && (
                <Section title="Pending change">
                  <PendingBlock pending={pending} isDpo={isDpo} />
                </Section>
              )}

              {/* History */}
              <Section title="History">
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
                <Link href={`/masking/audit?field=${res.code}`} className="row-link" style={{ marginTop: 8, display: "inline-flex", gap: 4 }}>
                  See full log <ExternalLink size={12} />
                </Link>
              </Section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mask-drawer-section">
      <h3 className="mask-section-title">{title}</h3>
      {children}
    </section>
  );
}

function ActionError({ result }: { result: MaskingActionResult | null }) {
  if (!result || result.ok) return null;
  return <div className="notice danger" style={{ marginBottom: 10 }}><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>;
}

function EditForm({ res, floor, floorName, onDone, onNeedsApproval }: { res: FieldResolution; floor: Rule | null; floorName: string | null; onDone: () => void; onNeedsApproval: () => void }) {
  const { pending, result, run } = useRun();
  const [rule, setRule] = useState<Rule>(res.effective ? { family: res.effective.family, params: res.effective.params } : { family: "partial", params: { revealLast: 4, maskChar: "*" } });
  const layer = res.governedBy?.layer ?? "tenant";

  const save = () => run(
    () => editTenantRuleAction(res.code, [{ layer, channel: null, family: rule.family, params: rule.params }]),
    onDone,
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3 className="mask-section-title">{res.hasRule ? "Edit rule" : "Add rule"} — default</h3>
      <ActionError result={result} />
      {result?.errorKind === "NeedsApproval" && (
        <div className="notice warn"><div className="notice-title">This loosens the current rule</div><div>A change that weakens a rule needs DPO approval. <button className="link-btn" onClick={onNeedsApproval}>Switch to a proposal →</button></div></div>
      )}
      <RuleEditor value={rule} onChange={setRule} floor={floor} floorName={floorName} channel={null} sampleValue={res.sampleValue} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={onDone}>Cancel</button>
        <button className="btn primary sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
      <p className="cell-sub">Tightening saves directly. A change that loosens the rule becomes a proposal for the DPO.</p>
    </div>
  );
}

function ProposeForm({ res, floor, floorName, onDone }: { res: FieldResolution; floor: Rule | null; floorName: string | null; onDone: () => void }) {
  const { pending, result, run } = useRun();
  const current: Rule = res.effective ? { family: res.effective.family, params: res.effective.params } : { family: "full", params: {} };
  const [rule, setRule] = useState<Rule>(current);
  const [reason, setReason] = useState("");
  const layer = res.governedBy?.layer ?? "regional";

  const submit = () => run(
    () => proposeChangeAction(
      res.code,
      [{ layer, channel: null, family: current.family, params: current.params }],
      [{ layer, channel: null, family: rule.family, params: rule.params }],
      reason,
    ),
    onDone,
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3 className="mask-section-title">Propose change</h3>
      <ActionError result={result} />
      <div className="split-2" style={{ gap: 12 }}>
        <div><div className="cell-sub" style={{ marginBottom: 4 }}>Current</div><div className="lock-box degraded"><strong>{ruleLabel(current)}</strong></div></div>
        <div><div className="cell-sub" style={{ marginBottom: 4 }}>Proposed</div><RuleEditor value={rule} onChange={setRule} floor={floor} floorName={floorName} channel={null} sampleValue={res.sampleValue} /></div>
      </div>
      <label className="fld"><span>Reason for change</span>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change is needed, and which requirement drives it." />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={onDone}>Cancel</button>
        <button className="btn primary sm" disabled={pending || !reason.trim()} onClick={submit}>{pending ? "Submitting…" : "Submit for DPO approval"}</button>
      </div>
    </div>
  );
}

function ExceptionForm({ res, onDone }: { res: FieldResolution; onDone: () => void }) {
  const { pending, result, run } = useRun();
  const [rolePick, setRolePick] = useState(EXCEPTION_ROLES[0]);
  const [purpose, setPurpose] = useState("");
  const [duration, setDuration] = useState(15);

  const submit = () => run(() => proposeExceptionAction(res.code, rolePick, purpose, duration, ""), onDone);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3 className="mask-section-title">Add unmask exception</h3>
      <ActionError result={result} />
      <p className="cell-sub">This creates a proposal for DPO approval. It never applies directly, and it expires automatically.</p>
      <label className="fld"><span>Role</span>
        <select className="input" value={rolePick} onChange={(e) => setRolePick(e.target.value)}>{EXCEPTION_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      </label>
      <label className="fld"><span>Purpose</span><input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. identity check on active grievance" /></label>
      <label className="fld"><span>Duration (minutes)</span><input className="input" type="number" min={5} max={240} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={onDone}>Cancel</button>
        <button className="btn primary sm" disabled={pending || !purpose.trim()} onClick={submit}>{pending ? "Submitting…" : "Submit for DPO approval"}</button>
      </div>
    </div>
  );
}

function PendingBlock({ pending, isDpo }: { pending: PendingView; isDpo: boolean }) {
  const { pending: busy, result, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
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
        ) : (
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <button className="btn primary sm" disabled={busy} onClick={() => run(() => decideChangeAction(pending.id, true, ""))}><Check size={12} /> Approve</button>
            <button className="btn ghost sm" onClick={() => setRejecting(true)}><Ban size={12} /> Reject</button>
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
